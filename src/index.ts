import loadConfig from 'js-libs/config'
import { UserProvidedAppConfig, AppConfig, Repository } from './definitions'
import loadConfig2 from './config'
import {hostname} from 'os'
import createLogger, { Logger } from './logger'
import Daemon from './daemon'
import Api from './api'
import { each } from 'lodash'

const schema = require('./user-provided-app-config-schema.json')

const config = loadConfig<UserProvidedAppConfig, AppConfig>({
    filename: process.argv[2],
    mandatoryFile: false,
    envPrefix: 'backuper',
    userProvidedConfigSchema: schema,
    finalizer(userProvidedAppConfig) {
        const repositories: AppConfig['repositories'] = {}

        // Problems with mapValues()
        each(userProvidedAppConfig.repositories, (userProvidedRepository, userProvidedRepositoryName) => {
            repositories[userProvidedRepositoryName] = {
                ...userProvidedRepository,
                name: userProvidedRepositoryName
            }
        })

        const backups: AppConfig['backups'] = {}

        // typesript is lost !
        each(userProvidedAppConfig.backups, (userProvidedBackup, userProvidedBackupName) => {
            const backupsRepositories: string[] = []

            each(userProvidedBackup.repositories, (value, key) => {
                if (typeof value === 'string') {
                    const repositoryReference: string = value
                    if (!repositories[repositoryReference]) {
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

                if (repositories[repository.name]) {
                    throw new Error(`Repository ${repository.name} already exists, for backup ${userProvidedBackupName}`)
                }

                repositories[repository.name] = repository
                backupsRepositories.push(repository.name)
            })

            backups[userProvidedBackupName] = {
                name: userProvidedBackupName,
                ...userProvidedBackup,
                repositories: backupsRepositories
            }
        })

        return {
            hostname: userProvidedAppConfig.hostname || hostname(),
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

console.log(JSON.stringify(config, null, 4))


// const config = loadConfig2()
// const logger = createLogger(config.log.level)

// logger.info('Starting', { config })

// // Creating Daemon
// const daemon = new Daemon(config, logger)
// daemon.start()

// // Creating API
// let api: Api
// if (config.api) {
//     api = new Api(config.api, daemon, logger)
//     api.start()
// }

// process.on('SIGTERM', () => {
//     logger.info('Exit requested, stopping...')
//     daemon.stop()
//     if (api) {
//         api.stop()
//     }
// })

// process.on('exit', () => logger.info('Bye Bye'))
