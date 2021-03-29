#!/usr/bin/env python

from shlex import quote
from gallocloud_utils.scheduling import schedule, create_scheduler
from gallocloud_utils.jsonlogging import configure_logger
from gallocloud_utils.config import load_config_from_env
from fnqueue import FnQueue, ThreadedFnQueueRunner
from flatten_dict import flatten
from restic import call_restic

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
            backup['hostname'] = backup['hostname'] if 'hostname' in backup else config['hostname']
            backup['watch'] = False if backup.get('watch', 'false') in ['0', 'false', ''] True

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
            options = ['--tag', quote('backup-' + backup['name'])] + get_restic_global_opts()
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
scheduler = create_scheduler()
fn_queue = FnQueue()
fn_queue_runner = ThreadedFnQueueRunner(fn_queue)

logger.info('Starting APP', extra={'action': 'main', 'status': 'starting'})
logger.debug('Loaded config ' + str(config), extra={'action': 'main', 'status': 'starting'})

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
        pass

fn_queue_runner.run()
scheduler.run()
