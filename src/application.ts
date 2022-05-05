import { AppConfig } from './definitions'
import { Logger } from 'js-libs/logger'
import { JobsRegistry, JobsRunner } from 'js-libs/jobs'
import FnScheduler from 'js-libs/fn-scheduler'
import FsWatcher from 'js-libs/fs-watcher'
import createLogger from 'js-libs/logger'
import Api from './api'
import ResticClient from './restic-client'
import JobOperator from './job-operator'

export default class Application {
    protected config: AppConfig
    protected logger: Logger
    protected started: boolean = false
    protected api: Api
    protected jobRunner: JobsRunner
    protected fnSchedulers: FnScheduler[] = []
    protected fsWatchers: FsWatcher[] = []

    constructor(config: AppConfig) {
        this.config = config
        this.logger = createLogger(config.log.level)
        this.logger.info('App Initialization with config', { config })
        this.api = new Api(config.api, this.logger)
        this.jobRunner = new JobsRunner({logger: this.logger, concurrency: 1})


        const resticClient = new ResticClient()
        const jobOperator = new JobOperator({resticClient})
    }

    async start() {
        if (this.started) {
            return
        }

        this.logger.info('App Starting')
        this.started = true

        Object.keys(this.config.repositories).forEach((repositoryName) => {
            this.initRepository(repositoryName)
        })

        await this.startStopServices('start')
    }

    async stop() {
        if (!this.started) {
            return
        }
        this.logger.info('App Stopping')
        this.started = false

        await this.startStopServices('stop')
    }

    async startStopServices(action: 'start' | 'stop') {
        await Promise.all([
            this.api,
            this.jobRunner,
            ...this.fnSchedulers,
            ...this.fsWatchers
        ].map(startStoppable => startStoppable[action]()))
    }
}
