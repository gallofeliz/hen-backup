#!/usr/bin/env python

from shlex import quote
from gallocloud_utils.scheduling import schedule, create_scheduler, convert_to_seconds
from gallocloud_utils.jsonlogging import configure_logger
from gallocloud_utils.config import load_config_from_env
from gallocloud_utils.fswatcher import create_fswatch_callback
from fnqueue import FnQueue, ThreadedFnQueueRunner
from flatten_dict import flatten
from restic import call_restic, kill_restic
import signal
import rpyc
import time
import threading
import logging
from tasks import Task, TaskManager
import re

def load_config():
    def format(config):
        config['repositories'] = config.pop('repository')
        config['backups'] = config.pop('backup')
        for name in config['repositories']:
            repository = config['repositories'][name]
            repository['name'] = name
            repository['check'] = repository.get('check')
            if repository['check']:
                repository['check']['schedule'] = repository['check']['schedule'].split(';')
            repository['providerEnv'] = {}
            for provider_name in ['os', 'aws', 'st', 'b2', 'azure', 'google', 'rclone']:
                if provider_name in repository:
                    repository['providerEnv'] = flatten(
                        repository[provider_name],
                        reducer=lambda k1, k2: provider_name.upper() + '_' + k2.upper() if k1 is None else k1 + '_' + k2.upper()
                    )
                    del repository[provider_name]

        for name in config['backups']:
            backup = config['backups'][name]
            backup['name'] = name
            backup['paths'] = backup['paths'].split(',')
            backup['repositories'] = list(map(lambda name: config['repositories'][name.lower()], backup['repositories'].split(',')))
            backup['schedule'] = backup['schedule'].split(';') if 'schedule' in backup else []
            backup['excludes'] = backup['excludes'].split(',') if 'excludes' in backup else []
            backup['watch'] = False if backup.get('watch', 'false') in ['0', 'false', ''] else True
            backup['watchwait'] = backup['watchwait'].split('-') if 'watchwait' in backup else None

        config['hostname'] = config['hostname'].lower()
        config['log'] = config.get('log', {})
        config['log']['level'] = config['log'].get('level', 'info').upper()
        return config
    return load_config_from_env(formatter=format)

def convert_to_KiB(size):
    kilo_per_unit = {"k": 1, "m": 1024, "g": 1048576}
    return int(size[:-1]) * kilo_per_unit[size[-1].lower()]

def get_restic_global_opts():
    options = []
    if config['uploadlimit']:
        options.extend(['--limit-upload', str(convert_to_KiB(config['uploadlimit']))])
    if config['downloadlimit']:
        options.extend(['--limit-download', str(convert_to_KiB(config['downloadlimit']))])
    return options

def get_restic_repository_envs(repository):
    return {
        'RESTIC_REPOSITORY': repository['location'],
        'RESTIC_PASSWORD': repository['password'],
        **repository['providerEnv']
    }

def init_repository(repository):
    logger.info('Starting repository initialization', extra={'action': 'init_repository', 'repository': repository['name'], 'status': 'starting'})
    try:
        call_restic(cmd='init', args=get_restic_global_opts(), env=get_restic_repository_envs(repository), logger=logger)
        logger.info('Initialization ended :)', extra={'action': 'init_repository', 'repository': repository['name'], 'status': 'success'})
    except Exception as e:
        logger.info('Unable to init ; probably already init else error ('+str(e)+')', extra={'action': 'init_repository', 'repository': repository['name'], 'status': 'failure'})

def check_repository(repository):
    logger.info('Starting check', extra={'action': 'check_repository', 'repository': repository['name'], 'status': 'starting'})
    try:
        call_restic(cmd='check', args=get_restic_global_opts(), env=get_restic_repository_envs(repository), logger=logger)
        logger.info('Check ended :)', extra={'action': 'check_repository', 'repository': repository['name'], 'status': 'success'})
    except Exception as e:
        logger.exception('Check failed :(', extra={'action': 'check_repository', 'repository': repository['name'], 'status': 'failure'})

def do_backup(backup):
    logger.info('Starting backup', extra={'action': 'backup', 'backup': backup['name'], 'status': 'starting'})
    success = True
    for repository in backup['repositories']:
        logger.info('Starting backup on repository', extra={'action': 'backup', 'backup': backup['name'], 'repository': repository['name'], 'status': 'starting'})
        try:
            options = ['--tag', quote('backup-' + backup['name']), '--host', config['hostname']] + get_restic_global_opts()
            args = backup['paths'] + list(map(lambda exclude : '--exclude=' + quote(exclude), backup['excludes']))
            call_restic(cmd='backup', args=options + args, env=get_restic_repository_envs(repository), logger=logger)
            logger.info('Backup on repository ended :)', extra={'action': 'backup', 'backup': backup['name'], 'repository': repository['name'], 'status': 'success'})
        except Exception as e:
            logger.exception('Backup on repository failed :(', extra={'action': 'backup', 'backup': backup['name'], 'repository': repository['name'], 'status': 'failure'})
            success = False

    if success:
        logger.info('Backup ended :)', extra={'action': 'backup', 'backup': backup['name'], 'status': 'success'})
    else:
        logger.error('Backup failed (one or more backup in repository failed) :(', extra={'action': 'backup', 'backup': backup['name'], 'status': 'failure'})

config = load_config()
logger = configure_logger(config['log']['level'])


class PasswordMaskingFilter(logging.Filter):
    def filter(self, record):
        for attr in dir(record):
            if attr[0:2] != '__' and isinstance(getattr(record, attr), str):
                setattr(record, attr, self.sanitize(getattr(record, attr)))

        return True

    def sanitize(self, value):
        value = re.sub(r"'(.*?(PASSWORD|KEY|SECRET|AUTH|TOKEN|CREDENTIAL).*?)': '([^']+)'", r"'\1': '***'", value, flags=re.IGNORECASE)

        return value


logger.getLogger().addFilter(PasswordMaskingFilter())

scheduler = create_scheduler()
fn_queue = FnQueue()
fn_queue_runner = ThreadedFnQueueRunner(fn_queue)

class Daemon(rpyc.Service):
    def __init__(self, config):
        self._config = config
        self._logger = configure_logger(config['log']['level'])
        self._task_manager = TaskManager(self._logger)
        self._task_manager.run()
        rpc = rpyc.ThreadedServer(service=self, port=18812, protocol_config={'allow_all_attrs': True, "allow_public_attrs":True})
        threading.Thread(target=rpc.start).start()

    def list_snapshots(self, repository_name, hostname, backup_name):
        self._logger.info('list_snapshots requested', extra={
            'component': 'daemon',
            'action': 'list_snapshots',
            'status': 'queuing'
        })

        def do_list_snapshots():
            self._logger.info('list_snapshots starting', extra={
                'component': 'daemon',
                'action': 'list_snapshots',
                'status': 'starting'
            })

            try:
                args=get_restic_global_opts()
                if backup_name:
                    args = args + ['--tag', 'backup-' + backup_name.lower()]
                if hostname:
                    args = args + ['--host', hostname.lower()]
                response = call_restic(cmd='snapshots', args=args, env=get_restic_repository_envs(self._config['repositories'][repository_name.lower()]), logger=logger, json=True)
                restic_snapshots = response['stdout']
                snapshots = []

                for raw_snapshot in restic_snapshots:
                    _backup_name = None
                    for tag in raw_snapshot['tags']:
                        if tag[0:7] == 'backup-':
                            _backup_name = tag[7:]
                    snapshots.append({
                        'Date': raw_snapshot['time'],
                        'Id': raw_snapshot['id'],
                        'Hostname': raw_snapshot['hostname'],
                        'Backup': _backup_name
                    })

                self._logger.info('list_snapshots success', extra={
                    'component': 'daemon',
                    'action': 'list_snapshots',
                    'status': 'success'
                })

                return snapshots
            except Exception as e:
                self._logger.info('list_snapshots failed', extra={
                    'component': 'daemon',
                    'action': 'list_snapshots',
                    'status': 'failure'
                })

                raise e

        return self._task_manager.add_task(
            task=Task(fn=do_list_snapshots),
            priority='immediate',
            ignore_if_duplicate=False,
            get_result=True
        )

    def check_repository(self, repository_name, priority='normal'):
        repository = config['repositories'][repository_name]

        self._task_manager.add_task(
            task=Task(fn=check_repository, args=(repository, )),
            priority=priority,
            ignore_if_duplicate=True,
            get_result=False
        )

    def restore_snapshot(self, repository_name, snapshot, target_path=None, priority='normal', wait_done=False):
        if not target_path:
            target_path = '/'
        def do(repository_name, snapshot, target_path):
            repository_name = repository_name.lower()
            logger.info('Starting restore', extra={'action': 'restore_snapshot', 'repository': repository_name, 'snapshot': snapshot, 'status': 'starting'})
            args = [snapshot]
            args = args + ['--target', target_path]
            try:
                call_restic(cmd='restore', args=args, env=get_restic_repository_envs(config['repositories'][repository_name]), logger=logger)
                logger.info('Restore ended', extra={'action': 'restore_snapshot', 'repository': repository_name, 'snapshot': snapshot, 'status': 'success'})
            except Exception as e:
                logger.exception('Restore failed', extra={'action': 'restore_snapshot', 'repository': repository_name, 'snapshot': snapshot, 'status': 'failure'})
        fn_queue.push(fn=do, args=(repository_name, snapshot, target_path,))

daemon = Daemon(config)

logger.info('Starting APP', extra={'action': 'main', 'status': 'starting'})
logger.debug('Loaded config ' + str(config), extra={'action': 'main', 'status': 'starting'})

def signal_handler(sig, frame):
    kill_restic()

signal.signal(signal.SIGTERM, signal_handler)

for repository_name in config['repositories']:
    repository = config['repositories'][repository_name]
    fn_queue.push(fn=init_repository, args=(repository, ))
    if repository['check']:
        schedule(
            repository['check']['schedule'],
            lambda repository: fn_queue.push(fn=check_repository, args=(repository, )),
            args=(repository,),
            runAtBegin=True,
            scheduler=scheduler
        )

for backup_name in config['backups']:
    backup = config['backups'][backup_name]
    if backup['schedule']:
        schedule(
            backup['schedule'],
            lambda backup: fn_queue.push(fn=do_backup, args=(backup, )),
            args=(backup,),
            runAtBegin=True,
            scheduler=scheduler
        )
    if backup['watch']:
        create_fswatch_callback(**{
            'paths':backup['paths'],
            'ignore':backup['excludes'],
            'fn':lambda backup: fn_queue.push(fn=do_backup, args=(backup, )),
            'args':(backup,),
            'logger': logger,
            **({ 'wait_min': convert_to_seconds(backup['watchwait'][0]), 'wait_max': convert_to_seconds(backup['watchwait'][1]) } if backup['watchwait'] else {})
        })

fn_queue_runner.run()
scheduler.run()
