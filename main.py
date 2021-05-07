#!/usr/bin/env python

from gallocloud_utils.config import load_config_from_env
from gallocloud_utils.jsonlogging import configure_logger
import signal
from daemon import Daemon

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

            if 'hooks' not in backup:
                backup['hooks'] = {}

            if 'before' not in backup['hooks']:
                backup['hooks']['before'] = None

            if 'after' not in backup['hooks']:
                backup['hooks']['after'] = None

            if backup['hooks']['before']:
                hook = backup['hooks']['before']
                hook['onfailure'] = hook.get('onfailure', 'stop') # ignore, stop, continue
                if hook['onfailure'] not in ['ignore', 'continue', 'stop']:
                    raise Exception('invalid onfailure')
                hook['retries'] = int(hook.get('retries', '0'))

        config['hostname'] = config['hostname'].lower()
        config['log'] = config.get('log', {})
        config['log']['level'] = config['log'].get('level', 'info').upper()
        return config
    return load_config_from_env(formatter=format)

config = load_config()
logger = configure_logger(config['log']['level'])

daemon = Daemon(config, logger)

def signal_handler(sig, frame):
    daemon.stop()

signal.signal(signal.SIGTERM, signal_handler)
daemon.start()
