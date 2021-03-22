#!/usr/bin/env python

import subprocess, threading, logging, sched, os, time
from shlex import quote
from gallocloud_utils.scheduling import get_next_schedule_time
from gallocloud_utils.jsonlogging import configure_logger
from gallocloud_utils.config import load_config_from_env
from flatten_dict import flatten

def load_config():
    def format(config):
        config['repositories'] = config.pop('repository')
        config['backups'] = config.pop('backup')
        for name in config['repositories']:
            repository = config['repositories'][name]
            repository['check'] = repository.get('check')
            repository['providerEnv'] = {}
            for provider_name in ['os', 'aws']:
                if provider_name in repository:
                    repository['providerEnv'] = flatten(
                        repository[provider_name],
                        reducer=lambda k1, k2: provider_name.upper() + '_' + k2.upper() if k1 is None else k1 + '_' + k2.upper()
                    )
                    del repository[provider_name]

        for name in config['backups']:
            backup = config['backups'][name]
            backup['paths'] = backup['paths'].split(',')
            backup['repositories'] = backup['repositories'].split(',')
            backup['schedule'] = backup['schedule'].split(';')
            backup['excludes'] = backup['excludes'].split(',') if 'excludes' in backup else []
            backup['hostname'] = backup['hostname'] if 'hostname' in backup else config['hostname']
        return config
    return load_config_from_env(formatter=format)

print(load_config())
exit()




logging.basicConfig(level=logging.DEBUG)

logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter('%(levelname)%(message)')
logHandler.setFormatter(formatter)
logging.getLogger().handlers = []
logging.getLogger().addHandler(logHandler)

class CallResticError(Exception):
    def __init__(self, result):
        self.result = result
        self.message = 'Call Restic Error'
    def get_result(self):
        return self.result

def call_restic(cmd, args = []):
    cmd_parts = ["restic"] + [cmd] + args
    logging.debug('START ' + ' '.join(cmd_parts), extra={'action': 'call_restic', 'status': 'starting'})
    proc = subprocess.Popen(
        cmd_parts,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True
    )

    out=[] # only last to avoid memory boooom ?
    err=[] # only last to avoid memory boooom ?

    def log(stream, channel, stack):
        for rline in iter(stream.readline, ''):
            line = rline.rstrip()
            if line:
                logging.debug(channel + ' ' + line, extra={'action': 'call_restic', 'status': 'running'})
                stack.append(line)


    threading.Thread(target=log, args=(proc.stdout, 'STDOUT', out,)).start()
    threading.Thread(target=log, args=(proc.stderr, 'STDERR', err,)).start()
    code = proc.wait()

    logging.debug('EXIT ' + str(code), extra={'action': 'call_restic', 'status': 'failure' if code else 'success'})

    result = {
        'code': code,
        'stdout': out,
        'stderr': err
    }

    if code > 0:
        raise CallResticError(result)

    return result

def convert_to_seconds(duration):
    seconds_per_unit = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}
    return int(duration[:-1]) * seconds_per_unit[duration[-1].lower()]

def convert_to_KiB(size):
    kilo_per_unit = {"k": 1, "m": 1024, "g": 1048576}
    return int(size[:-1]) * kilo_per_unit[size[-1].lower()]

def load_config():
    config = {
        'global': {
            'uploadLimit': os.environ.get('GLOBAL_UPLOAD_LIMIT'),
            'downloadLimit': os.environ.get('GLOBAL_DOWNLOAD_LIMIT')
        },
        'backups': [],
        'check': {
            'schedule': os.environ['CHECK_SCHEDULE']
        }
    }

    env_backups = {}

    for k, v in os.environ.items():
        if k[0:7] == 'BACKUP_':
            name, *rest = k[7:].split('_')
            name = name.lower()
            rest = '_'.join(rest)

            if name not in env_backups:
                env_backups[name] = {}

            env_backups[name][rest] = v

    for name in env_backups:
        values = env_backups[name]
        backup_config = {
            'name': name,
            'paths': values['PATHS'].split(','),
            'excludes': values['EXCLUDES'].split(',') if 'EXCLUDES' in values else [],
            'schedule': values['SCHEDULE'],
            #'retryFrequency': values['RETRY_SCHEDULE'] if 'RETRY_SCHEDULE' in values else '30m'
        }
        config['backups'].append(backup_config)

    if not config['backups']:
        raise Exception('Missing config backups')

    return config


# action target message
scheduler = sched.scheduler(time.time)
config = load_config()

logging.info('Starting APP with config ' + str(config), extra={'action': 'main', 'status': 'starting'})

def schedule_action(str_schedule, fn, args = ()):
    if ' ' in str_schedule:
        scheduler.enterabs(croniter(str_schedule).get_next(), 1, fn, args)
    else:
        scheduler.enter(convert_to_seconds(str_schedule), 1, fn, args)

def get_restic_global_opts():
    options = []
    if config['global']['uploadLimit']:
        options.extend(['--limit-upload', str(convert_to_KiB(config['global']['uploadLimit']))])
    if config['global']['downloadLimit']:
        options.extend(['--limit-download', str(convert_to_KiB(config['global']['downloadLimit']))])
    return options

def init():
    logging.info('Starting repository initialization', extra={'action': 'init', 'status': 'starting'})
    try:
        call_restic('init', get_restic_global_opts())
        logging.info('Initialization ended :)', extra={'action': 'init', 'status': 'success'})
    except Exception as e:
        logging.info('Unable to init ; probably already init else error', extra={'action': 'init', 'status': 'failure'})

def schedule_backups():
    logging.info('Scheduling backups', extra={'action': 'schedule_backups', 'status': 'starting'})
    def backup(backup_config):
        logging.info('Starting backup', extra={'action': 'backup', 'backup': backup_config['name'], 'status': 'starting'})
        schedule_action(backup_config['schedule'], backup, (backup_config,))
        try:
            options = ['--tag', quote('backup-' + backup_config['name'])] + get_restic_global_opts()
            args = backup_config['paths'] + list(map(lambda exclude : '--exclude=' + quote(exclude), backup_config['excludes']))
            call_restic('backup', options + args)
            logging.info('Backup ended :)', extra={'action': 'backup', 'backup': backup_config['name'], 'status': 'success'})
            #scheduler.enter(convert_to_seconds(backup_config['schedule']), 1, backup, (backup_config,))
        except Exception as e:
            logging.exception('Backup failed :(', extra={'action': 'backup', 'backup': backup_config['name'], 'status': 'failure'})
            #logging.exception(log_template, 'BACKUP', backup_config['name'], 'Backup failed :( ; will retry later')
            #scheduler.enter(convert_to_seconds(backup_config['retryFrequency']), 1, backup, (backup_config,))
    for backup_config in config['backups']:
        backup(backup_config)

def schedule_check():
    logging.info('Scheduling check', extra={'action': 'schedule_check', 'status': 'starting'})
    def check():
        logging.info('Starting check', extra={'action': 'check', 'status': 'starting'})
        schedule_action(config['check']['schedule'], check)
        try:
            call_restic('check', get_restic_global_opts())
            logging.info('Check ended :)', extra={'action': 'check', 'status': 'success'})
        except Exception as e:
            logging.exception('Check failed :(', extra={'action': 'check', 'status': 'failure'})
    check()

#def stats():
    #call_restic('stats', ['--json']) # snapshots, list, stats but not the repository total size
    #List snapshots by backups config
    #Get global infos (snapshots count, repository size etc)
    #pass

# Make prune ?

init()
schedule_backups()
schedule_check()
scheduler.run()
