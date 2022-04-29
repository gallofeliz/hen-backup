import { AppConfig } from './definitions'
import { Logger } from 'js-libs/logger'
import { JobsManager } from 'js-libs/jobs'
import FnScheduler from 'js-libs/fn-scheduler'
import FsWatcher from 'js-libs/fs-watcher'
import createLogger from './logger'
import Api from './api'

export default class Application {
    protected logger: Logger
    protected started: boolean = false
    protected api: Api
    protected jobManager: JobsManager
    protected fnSchedulers: FnScheduler[] = []
    protected fsWatchers: FsWatcher[] = []

    constructor(config: AppConfig) {
        this.logger = createLogger(config.log)
        this.logger.info('App Initialization with config', { config })
        this.api = new Api(config.api, this.logger)
        this.jobManager = new JobsManager(this.logger)
        this.configureSchedulesAndWatches()
    }

    async start() {
        if (this.started) {
            return
        }

        this.logger.info('App Starting')
        this.started = true

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
            this.jobManager,
            ...this.fnSchedulers,
            ...this.fsWatchers
        ].map(startStoppable => startStoppable[action]()))
    }

    protected configureSchedulesAndWatches() {

    }
}
