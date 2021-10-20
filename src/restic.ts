import { ChildProcess, spawn } from 'child_process'
import { Logger } from './logger'
import { once, EventEmitter } from 'events'
import { sizeToKiB } from './utils'
import { v4 as uuid4 } from 'uuid'

export interface ResticOpts {
    uploadLimit?: string
    downloadLimit?: string
    repository: {
        location: string
        password: string
        providerEnv: Record<string, string>
    }
    outputStream?: NodeJS.WritableStream
    logger: Logger
    cacheDir?: string
}

export default class Restic {
    protected opts: Partial<ResticOpts>

    constructor(opts: Partial<ResticOpts> = {}) {
        this.opts = opts
    }

    public call(command: string, args: string[], opts: Partial<ResticOpts> = {}): ResticCall {
        const callOpts = {...this.opts, ...opts}

        if (!callOpts.repository || !callOpts.logger) {
            throw new Error('Missing repository or logger')
        }

        return new ResticCall(command, args, callOpts as ResticOpts)
    }
}

class ResticCall extends EventEmitter {
    protected process?: ChildProcess
    protected uuid: string = uuid4()
    protected logger: Logger

    constructor(command: string, args: string[], opts: ResticOpts) {
        super()

        this.logger = opts.logger.child({ resticCallUuid : this.uuid })

        if (command === 'dump' && !opts.outputStream) {
            throw new Error('Please provide outputStream for dump')
        }

        if (command !== 'dump' && opts.outputStream) {
            throw new Error('Unexpected outputStream')
        }

        this.run(command, args, opts)
    }

    protected async run(command: string, args: string[], opts: ResticOpts) {

        const env = {
            RESTIC_REPOSITORY: opts.repository.location,
            RESTIC_PASSWORD: opts.repository.password,
            ...opts.repository.providerEnv
        }

        const json = ['ls', 'snapshots'].includes(command) ? true : false
        const multilineJson = command === 'ls' ? true : false

        // Make cleanup cache only on some commands to avoid to make slower "fast" commands ?
        // Or make cleanup cache in a job (boring job ahah) ?
        const resticArgs = ['--cleanup-cache', command].concat(args).concat(json ? ['--json'] : [])
        const resticEnv = {...env, 'RESTIC_CACHE_DIR': opts.cacheDir || '/var/cache/restic'}

        if (opts.uploadLimit) {
            resticArgs.push('--limit-upload', sizeToKiB(opts.uploadLimit).toString())
        }

        if (opts.downloadLimit) {
            resticArgs.push('--limit-download', sizeToKiB(opts.downloadLimit).toString())
        }

        const stdout: string[] = []
        const stderr: string[] = []

        this.logger.info('Starting', {
            resticCall: {
                cmd: 'restic',
                args: resticArgs,
                env: resticEnv
            }
        })

        const process = spawn('restic', resticArgs, { env: resticEnv, killSignal: 'SIGINT' })
        this.process = process

        if (opts.outputStream) {
            this.logger.info('Redirecting outputStream')
            process.stdout.pipe(opts.outputStream)
        } else if (json) {
            process.stdout.on('data', (data) => {
                const strData = data.toString()
                this.logger.info('STDOUT', { data: strData })
                stdout.push(strData)
            })
        }

        process.stderr.on('data', data => {
            const strData = data.toString()
            this.logger.info('STDERR', { data: strData })
            stderr.push(strData)
        })

        try {
            const [exitCode]: [number] = await once(process, 'exit') as [number]
            this.logger.info('exitCode ' + exitCode)
            if (exitCode > 0) {
                return this.emit('error', new Error('Restic error : ' + stderr.join('\n')))
            }
        } catch (e) {
            return this.emit('error', e)
        }

        if (!json) {
            return this.emit('finish')
        }

        this.emit('finish', multilineJson ? stdout.map((line) => JSON.parse(line)) : JSON.parse(stdout.join('')))
    }

    public abort() {
        if (!this.process || this.process.exitCode !== null) {
            return
        }
        this.logger.info('Killing')
        this.process.kill('SIGINT')
    }
}
