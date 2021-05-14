#!/usr/bin/env python

from gallocloud_utils.config import load_config_from_env
from gallocloud_utils.jsonlogging import configure_logger
import signal
from daemon import Daemon
from glom import glom, assign
from flatten_dict import flatten
from gallocloud_utils.yamlconfig import load_config_from_yaml

def format(config):
    if 'repositories' not in config:
        config['repositories'] = {}
    # Migrate repositories in backups to repositories
    for backup_name in config['backups']:
        backup = config['backups'][backup_name]
        backup['name'] = backup_name
        new_repositories = []
        if type(backup['repositories']) is list:
            for repository_name_or_object in backup['repositories']:
                if type(repository_name_or_object) is not str:
                    name = repository_name_or_object['name']
                    if name in config['repositories']:
                        raise Exception('Repository double : %s' % name)
                    config['repositories'][name] = repository_name_or_object
                    new_repositories.append(name)
                else:
                    if repository_name_or_object not in config['repositories']:
                        raise Exception('Repository %s not found' % repository_name_or_object)
                    new_repositories.append(repository_name_or_object)
        else:
            for repository_name in backup['repositories']:
                if repository_name in config['repositories']:
                    raise Exception('Repository double : %s' % repository_name)
                config['repositories'][repository_name] = backup['repositories'][repository_name]
                new_repositories.append(repository_name)

        backup['repositories'] = new_repositories

    # Prepare Restic envs
    for repository_name in config['repositories']:
        repository = config['repositories'][repository_name]
        repository['name'] = repository_name
        repository['providerEnv'] = {}
        for provider_name in ['os', 'aws', 'st', 'b2', 'azure', 'google', 'rclone']:
            if provider_name in repository:
                repository['providerEnv'] = flatten(
                    repository[provider_name],
                    reducer=lambda k1, k2: provider_name.upper() + '_' + k2.upper() if k1 is None else k1 + '_' + k2.upper()
                )
                for env_name in repository['providerEnv']:
                    repository['providerEnv'][env_name] = str(repository['providerEnv'][env_name])
                del repository[provider_name]

    return config

config = load_config_from_yaml(default_filepath='/etc/backuper/config.yml', format=format)
logger = configure_logger(glom(config, 'log.level', default='info'))

daemon = Daemon(config, logger)

def signal_handler(sig, frame):
    daemon.stop()

signal.signal(signal.SIGTERM, signal_handler)
daemon.start()
