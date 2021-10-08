import { createLogger as createWinstonLogger, format, transports, Logger } from 'winston'
import { mapValues, cloneDeep } from 'lodash'

export { Logger }

const secrets = ['password', 'key', 'secret', 'auth', 'token', 'credential']

function sanitize(variable: any): any {
    if (typeof variable === 'object') {
        for (const key in variable) {
            if (typeof key !== 'string') {
                continue
            }
            if (typeof variable[key] === 'object') {
                sanitize(variable[key])
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

export default function createLogger(level: string): Logger {
    return createWinstonLogger({
        level,
        format: format.combine(
            (format((info) => sanitize(cloneDeep(info))))(),
            format.json()
        ),
        transports: [new transports.Console()]
    })
}
