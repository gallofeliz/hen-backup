import fs from 'fs'
import YAML from 'yaml'
import envsubst from '@tuplo/envsubst'
import _ from 'lodash'
import {hostname} from 'os'

export interface ApiConfig {
    port: number
    users: Array<{
        username: string
        password: string
    }>
}

export interface Hook {
    type: 'http'
    url: string
    method?: string
    timeout?: string
    retries?: number
    onfailure?: 'continue' | 'stop' | 'ignore'
}

export interface Config {
    hostname: string
    uploadLimit?: string
    downloadLimit?: string
    api?: ApiConfig
    log: {
        level: string
    }
    repositories: {
        [repositoryName: string]: {
            name: string
            location: string
            password: string
            check?: {
                schedules: string[]
                priority?: string
            },
            uploadLimit?: string
            downloadLimit?: string
            providerEnv: Record<string, string>
        }
    }
    backups: {
        [backupName: string]: {
            name: string
            repositories: string[]
            paths: string[]
            excludes?: string[]
            schedules?: string[]
            watch?: {
                wait?: {
                    min: string
                    max: string
                }
            }
            priority?: string
            prune?: {
                schedules?: string[]
                priority?: string
                retentionPolicy: {
                    nbOfHourly?: number
                    nbOfdaily?: number
                    nbOfWeekly?: number
                    nbOfMonthly?: number
                    nbOfYearly?: number
                    minTime?: string
                }
            }
            hooks?: {
                before?: Hook
            }
        }
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

    // Migrate repositories in backups to repositories

    config.repositories = config.repositories || {}

    // @TODO from Python, lint it

    _.forEach(config.backups, (backup, backup_name) => {
        backup.name = backup_name

        const new_repositories: string[] = []

        if (Array.isArray(backup.repositories)) {
            backup.repositories.forEach((repository_name_or_object: any) => {
                if (typeof(repository_name_or_object) !== 'string') {
                    const name = repository_name_or_object['name']
                    if (config.repositories[name]) {
                        throw new Error('Repository double : ' + name)
                    }
                    config['repositories'][name] = repository_name_or_object
                    new_repositories.push(name)
                } else {
                    if (!config['repositories'][repository_name_or_object]) {
                        throw new Error('Repository ' + repository_name_or_object + ' not found')
                    }
                    new_repositories.push(repository_name_or_object)
                }
            })
        } else {
            Object.keys(backup['repositories']).forEach(repository_name => {
                if (config['repositories'][repository_name]) {
                    throw new Error('Repository double : ' + repository_name)
                }
                config['repositories'][repository_name] = backup['repositories'][repository_name]
                new_repositories.push(repository_name)
            })
        }

        backup['repositories'] = new_repositories
    })

    config.repositories = _.mapValues(config.repositories, (repository, repositoryName) => {
        // Prepare Restic envs

        repository.name = repositoryName
        repository.providerEnv = {}

        for (const providerName of ['os', 'aws', 'st', 'b2', 'azure', 'google', 'rclone']) {


            if (repository[providerName]) {
                repository.providerEnv = _.reduce(repository[providerName], (providerEnv: Record<string, string>, value: any, key: string) => {
                    providerEnv[providerName.toUpperCase() + '_' + key.toUpperCase()] = value.toString()

                    return providerEnv
                }, {})

                delete repository[providerName]
            }
        }

        return repository
    })

    return config
}

