import Logger from './logger'
import { Config } from './config'
import Daemon from './daemon'

export default class Api {
    protected logger: Logger

    constructor(config: Config['api'], daemon: Daemon, logger: Logger) {
        this.logger = logger.child('api')

    }

    public start() {
        this.logger.info('Starting')

    }

    public stop() {
        this.logger.info('Stopping')
    }
}
