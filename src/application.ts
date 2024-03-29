import { Logger } from 'js-libs/logger'
import { JobsRunner } from 'js-libs/jobs'
import FnScheduler from 'js-libs/fn-scheduler'
import FsWatcher from 'js-libs/fs-watcher'
import createLogger from 'js-libs/logger'
import Api from './api'
import ResticClient from './restic-client'
import RepositoriesService, { Repository } from './repositories-service'
import BackupService, { Backup } from './backup-service'
import SnapshotsService from './snapshots-service'
import JobsService from './jobs-service'
import { ResticNetworkLimit } from './restic-client'
import { LogLevel } from 'js-libs/logger'
import { Size } from 'js-libs/utils'
import { ApiConfig } from './api'

export interface NetworkLimit extends ResticNetworkLimit {}

export interface LogConfig {
    level: LogLevel
}

export interface AppConfig {
    device: string
    uploadLimit?: Size // Only for automatic processes ? Background processes ?
    downloadLimit?: Size
    jobsDbPath: string
    log: LogConfig
    api: ApiConfig
    repositories: Repository[]
    backups: Backup[]
}

// ts-json-schema-generator --path src/definitions.ts --type UserProvidedAppConfig
export interface UserProvidedAppConfig {
    device?: string
    uploadLimit?: Size
    downloadLimit?: Size
    jobsDbPath?: string
    log?: Partial<LogConfig>
    api?: Partial<ApiConfig>
    repositories?: Record<string, Omit<Repository, 'name'>>
    backups: Record<string, Omit<Backup, 'repositories' | 'name'> & {
        repositories: Array<Repository | string> | Record<string, Omit<Repository, 'name'>>
    }>
}

export default class Application {
    protected config: AppConfig
    protected logger: Logger
    protected started: boolean = false
    protected api: Api
    protected fnSchedulers: FnScheduler[] = []
    protected fsWatchers: FsWatcher[] = []
    protected repositoriesService: RepositoriesService
    protected backupService: BackupService
    protected jobsService: JobsService

    constructor(config: AppConfig) {
        this.config = config
        this.logger = createLogger(config.log.level)
        this.logger.info('App Initialization with config', { config })

        this.jobsService = new JobsService({
            jobsRunner: new JobsRunner({logger: this.logger, concurrency: 1, handleAllocatedTimesReaches: true}),
            logger: this.logger,
            jobsDbPath: config.jobsDbPath
        })

        const resticClient = new ResticClient()

        this.repositoriesService = new RepositoriesService({
            jobsService: this.jobsService,
            resticClient: resticClient,
            repositories: this.config.repositories,
            networkLimit: this.config,
            logger: this.logger
        })

        this.backupService = new BackupService({
            device: this.config.device,
            jobsService: this.jobsService,
            resticClient: resticClient,
            backups: this.config.backups,
            networkLimit: this.config,
            logger: this.logger,
            repositoriesService: this.repositoriesService
        })

        const snapshotsService = new SnapshotsService({
            repositoriesService: this.repositoriesService,
            backupService: this.backupService,
            jobsService: this.jobsService,
            logger: this.logger,
            resticClient: resticClient,
            networkLimit: this.config,
            device: this.config.device
        })

        this.api = new Api({
            config: config.api,
            logger: this.logger,
            device: this.config.device,
            repositoriesService: this.repositoriesService,
            backupService: this.backupService,
            snapshotsService,
            jobsService: this.jobsService
        })
    }

    async start() {
        if (this.started) {
            return
        }

        this.logger.info('App Starting')
        this.started = true

        // Pattern problem... start should so be Abortable ?

        try {
            await this.api.start()
            await this.jobsService.start()
            await this.repositoriesService.start()
            await this.backupService.start()
        } catch (e) {
            if (!this.started) {
                this.logger.info('Interrupted start', {e})
            } else {
                throw e
            }
        }
    }

    async stop() {
        if (!this.started) {
            return
        }
        this.logger.info('App Stopping')
        this.started = false

        await this.api.stop()
        await this.repositoriesService.stop()
        await this.backupService.stop()
        await this.jobsService.stop()
    }
}
