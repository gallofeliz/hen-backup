#!/usr/bin/env python

import subprocess, threading, logging, sched, os, time
from shlex import quote
from croniter import croniter

logging.basicConfig(level=logging.DEBUG, format='[%(levelname)s] %(message)s')

class CallResticError(Exception):
    def __init__(self, result):
        self.result = result
        self.message = 'Call Restic Error'
    def get_result(self):
        return self.result

def call_restic(cmd, args = []):
    log_template = '(RESTIC) (%s) - %s'
    cmd_parts = ["restic"] + [cmd] + args
    logging.debug(log_template, 'START', ' '.join(cmd_parts))
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
                logging.debug(log_template, channel, line)
                stack.append(line)


    threading.Thread(target=log, args=(proc.stdout, 'STDOUT', out,)).start()
    threading.Thread(target=log, args=(proc.stderr, 'STDERR', err,)).start()
    code = proc.wait()

    logging.debug(log_template, 'EXIT', str(code))

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
log_template = '(APP) (%s) (%s) - %s'
scheduler = sched.scheduler(time.time)
config = load_config()

logging.info(log_template, 'MAIN', 'GLOBAL', 'Starting APP with config ' + str(config))

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
    logging.info(log_template, 'INIT', 'GLOBAL', 'Starting repository initialization')
    try:
        call_restic('init', get_restic_global_opts())
        logging.info(log_template, 'INIT', 'GLOBAL', 'Initialization ended :)')
    except Exception as e:
        logging.info(log_template, 'INIT', 'GLOBAL', 'Unable to init ; probably already init else error')

def schedule_backups():
    logging.info(log_template, 'BACKUP', 'GLOBAL', 'Scheduling backups')
    def backup(backup_config):
        logging.info(log_template, 'BACKUP', backup_config['name'], 'Starting backup')
        schedule_action(backup_config['schedule'], backup, (backup_config,))
        try:
            options = ['--tag', quote('backup-' + backup_config['name'])] + get_restic_global_opts()
            args = backup_config['paths'] + list(map(lambda exclude : '--exclude=' + quote(exclude), backup_config['excludes']))
            call_restic('backup', options + args)
            logging.info(log_template, 'BACKUP', backup_config['name'], 'Backup ended :)')
            #scheduler.enter(convert_to_seconds(backup_config['schedule']), 1, backup, (backup_config,))
        except Exception as e:
            logging.exception(log_template, 'BACKUP', backup_config['name'], 'Backup failed :(')
            #logging.exception(log_template, 'BACKUP', backup_config['name'], 'Backup failed :( ; will retry later')
            #scheduler.enter(convert_to_seconds(backup_config['retryFrequency']), 1, backup, (backup_config,))
    for backup_config in config['backups']:
        backup(backup_config)

def schedule_check():
    logging.info(log_template, 'CHECK', 'GLOBAL', 'Scheduling check')
    def check():
        logging.info(log_template, 'CHECK', 'GLOBAL', 'Starting check')
        schedule_action(config['check']['schedule'], check)
        try:
            call_restic('check', get_restic_global_opts())
            logging.info(log_template, 'CHECK', 'GLOBAL', 'Check ended :)')
        except Exception as e:
            logging.exception(log_template, 'CHECK', 'GLOBAL', 'Check failed :(')
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
