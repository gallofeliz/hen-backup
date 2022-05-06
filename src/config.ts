import { default as jslibsLoadConfig } from 'js-libs/config'
import { UserProvidedAppConfig, AppConfig } from './application'
import { Repository } from './repositories-service'
import {hostname} from 'os'
import { each } from 'lodash'
const schema = require('./user-provided-app-config-schema.json')

export default function loadConfig(filename: string): AppConfig {
    return jslibsLoadConfig<UserProvidedAppConfig, AppConfig>({
        filename,
        mandatoryFile: false,
        envPrefix: 'backuper',
        userProvidedConfigSchema: schema,
        finalizer(userProvidedAppConfig) {
            const repositories: AppConfig['repositories'] = []

            // Problems with mapValues()
            each(userProvidedAppConfig.repositories, (userProvidedRepository, userProvidedRepositoryName) => {
                repositories.push({
                    ...userProvidedRepository,
                    name: userProvidedRepositoryName
                })
            })

            const backups: AppConfig['backups'] = []

            // typesript is lost !
            each(userProvidedAppConfig.backups, (userProvidedBackup, userProvidedBackupName) => {
                const backupsRepositories: string[] = []

                each(userProvidedBackup.repositories, (value, key) => {
                    if (typeof value === 'string') {
                        const repositoryReference: string = value
                        if (!repositories.find(r => r.name === repositoryReference)) {
                            throw new Error(`Missing repository ${repositoryReference} for backup ${userProvidedBackupName}`)
                        }
                        backupsRepositories.push(repositoryReference)
                        return
                    }

                    const userProvidedRepository = value as Repository | Omit<Repository, 'name'>
                    const userProvidedRepositoryName = key as string

                    const repository: Repository = {
                        ...userProvidedRepository,
                        name: (userProvidedRepository as Repository).name || userProvidedRepositoryName
                    }

                    if (repositories.find(r => r.name === repository.name)) {
                        throw new Error(`Repository ${repository.name} already exists, for backup ${userProvidedBackupName}`)
                    }

                    repositories.push(repository)
                    backupsRepositories.push(repository.name)
                })

                backups.push({
                    name: userProvidedBackupName,
                    ...userProvidedBackup,
                    repositories: backupsRepositories
                })
            })

            // if (repository.stats) {
            //     for (const statName in repository.stats) {
            //         if (typeof repository.stats[statName] === 'string') {
            //             const shareName = repository.stats[statName]
            //             repository.stats[statName] = config.repositoriesSharedStats[statName][shareName]

            //             if (!repository.stats[statName]) {
            //                 throw new Error('Shared Stat ' + shareName + ' not found')
            //             }

            //             repository.stats[statName].shareName = shareName
            //         }
            //     }
            // }

            return {
                device: userProvidedAppConfig.device || hostname(),
                log: {
                    level: userProvidedAppConfig.log?.level || 'info'
                },
                api: {
                    port: userProvidedAppConfig.api?.port || 80,
                    users: userProvidedAppConfig.api?.users
                },
                repositories,
                backups
            }
        }
    })

}
