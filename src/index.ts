import loadConfig from './config'
import createLogger, { Logger } from './logger'
import Daemon from './daemon'
import Api from './api'

const config = loadConfig()
const logger = createLogger(config.log.level)

logger.info('Starting', { config })

// Creating Daemon
const daemon = new Daemon(config, logger)
daemon.start()

// Creating API
const api = new Api(config.api, daemon, logger)
api.start()

process.on('SIGTERM', () => {
    logger.info('Exit requested, stopping...')
    daemon.stop()
    api.stop()
})

process.on('exit', () => logger.info('Bye Bye'))
