#!/usr/bin/env python

from shlex import quote
from gallocloud_utils.scheduling import schedule, create_scheduler
from gallocloud_utils.jsonlogging import configure_logger
from gallocloud_utils.config import load_config_from_env
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
            for provider_name in ['os', 'aws']:
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
            backup['schedule'] = backup['schedule'].split(';')
            backup['excludes'] = backup['excludes'].split(',') if 'excludes' in backup else []
            backup['hostname'] = backup['hostname'] if 'hostname' in backup else config['hostname']
        config['log'] = config.get('log', {})
        config['log']['level'] = config['log'].get('level', 'info').upper()
        return config
    return load_config_from_env(formatter=format)

def convert_to_KiB(size):
    kilo_per_unit = {"k": 1, "m": 1024, "g": 1048576}
    return int(size[:-1]) * kilo_per_unit[size[-1].lower()]

def init_repository(repository):
    print('init ' + repository['name'])

def check_repository(repository):
    print('check ' + repository['name'])

def do_backup(backup):
    print('backup ' + backup['name'])

config = load_config()
logger = configure_logger(config['log']['level'])
scheduler = create_scheduler()

logger.info('Starting APP', extra={'action': 'main', 'status': 'starting'})

for repository_name in config['repositories']:
    repository = config['repositories'][repository_name]
    init_repository(repository)
    if repository['check']:
        schedule(repository['check']['schedule'], check_repository, args=(repository,), runAtBegin=True, scheduler=scheduler)

for backup_name in config['backups']:
    backup = config['backups'][backup_name]
    schedule(backup['schedule'], do_backup, args=(backup,), runAtBegin=True, scheduler=scheduler)

scheduler.run()








# # action target message
# scheduler = sched.scheduler(time.time)

# def schedule_action(str_schedule, fn, args = ()):
#     if ' ' in str_schedule:
#         scheduler.enterabs(croniter(str_schedule).get_next(), 1, fn, args)
#     else:
#         scheduler.enter(convert_to_seconds(str_schedule), 1, fn, args)

# def get_restic_global_opts():
#     options = []
#     if config['global']['uploadLimit']:
#         options.extend(['--limit-upload', str(convert_to_KiB(config['global']['uploadLimit']))])
#     if config['global']['downloadLimit']:
#         options.extend(['--limit-download', str(convert_to_KiB(config['global']['downloadLimit']))])
#     return options

# def init():
#     logger.info('Starting repository initialization', extra={'action': 'init', 'status': 'starting'})
#     try:
#         call_restic('init', get_restic_global_opts())
#         logger.info('Initialization ended :)', extra={'action': 'init', 'status': 'success'})
#     except Exception as e:
#         logger.info('Unable to init ; probably already init else error', extra={'action': 'init', 'status': 'failure'})

# def schedule_backups():
#     logger.info('Scheduling backups', extra={'action': 'schedule_backups', 'status': 'starting'})
#     def backup(backup_config):
#         logger.info('Starting backup', extra={'action': 'backup', 'backup': backup_config['name'], 'status': 'starting'})
#         schedule_action(backup_config['schedule'], backup, (backup_config,))
#         try:
#             options = ['--tag', quote('backup-' + backup_config['name'])] + get_restic_global_opts()
#             args = backup_config['paths'] + list(map(lambda exclude : '--exclude=' + quote(exclude), backup_config['excludes']))
#             call_restic('backup', options + args)
#             logger.info('Backup ended :)', extra={'action': 'backup', 'backup': backup_config['name'], 'status': 'success'})
#             #scheduler.enter(convert_to_seconds(backup_config['schedule']), 1, backup, (backup_config,))
#         except Exception as e:
#             logger.exception('Backup failed :(', extra={'action': 'backup', 'backup': backup_config['name'], 'status': 'failure'})
#             #logger.exception(log_template, 'BACKUP', backup_config['name'], 'Backup failed :( ; will retry later')
#             #scheduler.enter(convert_to_seconds(backup_config['retryFrequency']), 1, backup, (backup_config,))
#     for backup_config in config['backups']:
#         backup(backup_config)

# def schedule_check():
#     logger.info('Scheduling check', extra={'action': 'schedule_check', 'status': 'starting'})
#     def check():
#         logger.info('Starting check', extra={'action': 'check', 'status': 'starting'})
#         schedule_action(config['check']['schedule'], check)
#         try:
#             call_restic('check', get_restic_global_opts())
#             logger.info('Check ended :)', extra={'action': 'check', 'status': 'success'})
#         except Exception as e:
#             logger.exception('Check failed :(', extra={'action': 'check', 'status': 'failure'})
#     check()

# #def stats():
#     #call_restic('stats', ['--json']) # snapshots, list, stats but not the repository total size
#     #List snapshots by backups config
#     #Get global infos (snapshots count, repository size etc)
#     #pass

# # Make prune ?

# init()
# schedule_backups()
# schedule_check()
# scheduler.run()
