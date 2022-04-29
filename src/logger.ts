import { createLogger as createWinstonLogger, format, transports, Logger, config } from 'winston'
import { mapValues, cloneDeep } from 'lodash'
import { Writable } from 'stream'
import { LogConfig } from './definitions'
export { Logger }

const secrets = ['password', 'key', 'secret', 'auth', 'token', 'credential']

function sanitize(variable: any): any {
    if (typeof variable === 'object') {
        if (variable instanceof Error) {
            return variable.toString()
        }
        for (const key in variable) {
            if (typeof key !== 'string') {
                continue
            }
            if (typeof variable[key] === 'object') {
                variable[key] = sanitize(variable[key])
                continue
            }
            for (const secret of secrets) {
                if (key.toLowerCase().includes(secret)) {
                    variable[key] = '***'
                }
            }

        }

    }

    return variable
}

export default function createLogger({level}: LogConfig): Logger {
    const stream = new Writable({objectMode: true})

    const logger = createWinstonLogger({
        levels: config.syslog.levels,
        level,
        format: format.combine(
            format.timestamp(),
            (format((info) => sanitize(cloneDeep(info))))(),
            format.json()
        ),
        transports: [new transports.Console(), new transports.Stream({ stream })]
    })

    stream._write = (obj, encoding, next) => {
        logger.emit('log', obj)

        next()
    }

    return logger
}
