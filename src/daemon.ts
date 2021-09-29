import Logger from './logger'
import { Config } from './config'
import FnScheduler from './fn-scheduler'

export default class Daemon {
    protected logger: Logger
    protected fnScheduler: FnScheduler

    constructor(config: Config, logger: Logger) {
        this.logger = logger.child('daemon')
        this.fnScheduler = new FnScheduler
    }

    public start() {
        this.logger.info('Starting')
        this.fnScheduler.start()
    }

    public stop() {
        this.logger.info('Stopping')
        this.fnScheduler.stop()
    }
}
