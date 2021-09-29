import fs from 'fs'
import YAML from 'yaml'
import envsubst from '@tuplo/envsubst'
import _ from 'lodash'
import {hostname} from 'os'

export interface Config {
    hostname: string
    api?: {
        port: number
    }
    log: {
        level: string
    }
}

export default function loadConfig(): Config {
    const config = YAML.parse(
        envsubst(
            fs.readFileSync('/etc/backuper/config.yml', 'utf8')
        )
    )

    config.hostname = config.hostname || hostname()

    if (config.api) {
        config.api.port = config.api.port || 80
    }

    _.set(config, 'log.level', _.get(config, 'log.level', 'info'))

    // config.repositories = _(config.repositories || {}).map((repository, repositoryName) => {
    //     // Prepare Restic envs

    //     repository.name = repositoryName
    //     repository.providerEnv = {}

    //     for (const providerName of ['os', 'aws', 'st', 'b2', 'azure', 'google', 'rclone']) {
    //         if (repository[providerName]) {
    //             repository.providerEnv = flatten(
    //                 repository[provider_name],
    //                 reducer=lambda k1, k2: provider_name.upper() + '_' + k2.upper() if k1 is None else k1 + '_' + k2.upper()
    //             )
    //             for env_name in repository['providerEnv']:
    //                 repository['providerEnv'][env_name] = str(repository['providerEnv'][env_name])

    //             delete repository[provider_name]
    //         }


    //     }

    //     return repository
    // })

    // // Migrate repositories in backups to repositories

    // for backup_name in config['backups']:
    //     backup = config['backups'][backup_name]
    //     backup['name'] = backup_name
    //     new_repositories = []
    //     if type(backup['repositories']) is list:
    //         for repository_name_or_object in backup['repositories']:
    //             if type(repository_name_or_object) is not str:
    //                 name = repository_name_or_object['name']
    //                 if name in config['repositories']:
    //                     raise Exception('Repository double : %s' % name)
    //                 config['repositories'][name] = repository_name_or_object
    //                 new_repositories.append(name)
    //             else:
    //                 if repository_name_or_object not in config['repositories']:
    //                     raise Exception('Repository %s not found' % repository_name_or_object)
    //                 new_repositories.append(repository_name_or_object)
    //     else:
    //         for repository_name in backup['repositories']:
    //             if repository_name in config['repositories']:
    //                 raise Exception('Repository double : %s' % repository_name)
    //             config['repositories'][repository_name] = backup['repositories'][repository_name]
    //             new_repositories.append(repository_name)

    //     backup['repositories'] = new_repositories

    return config
}

