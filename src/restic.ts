import { ChildProcess, spawn } from 'child_process'
import Logger from './logger'
import { once } from 'events'

export interface ResticOpts {
    uploadLimit: string
    downloadLimit: string
    repository: {
        location: string
        password: string
        [k: string]: string
    }
}
// Make process like ?
export default {
    backup() {},
    snapshots() {}
}

// Make class ? Can help to block new processes in case of stop ?
export class Restic {
    protected processes: ChildProcess[] = []

    public async backup() {

    }

    public async snapshots() {

    }

    public async check() {

    }

    public async init() {

    }

    public async run(command: string, args: string[], env: Record<string, string>, logger: Logger, outputStream?: NodeJS.WritableStream): Promise<any> {

        logger = logger.child('restic-' + command)

        if (command === 'dump' && !outputStream) {
            throw new Error('Please provide outputStream for dump')
        }

        if (command !== 'dump' && outputStream) {
            throw new Error('Unexpected outputStream')
        }

        const json = ['ls', 'snapshots'].includes(command) ? true : false
        const multilineJson = command === 'ls' ? true : false

        const resticArgs = ['--cleanup-cache', command].concat(args).concat(json ? ['--json'] : [])
        const resticEnv = {...env, 'RESTIC_CACHE_DIR':'/tmp'}

        logger.info('Starting Restic process', {
            resticArgs,
            resticEnv
        })

        const stdout: string[] = []
        const stderr: string[] = []

        const process = spawn('restic', resticArgs, { env: resticEnv, killSignal: 'SIGINT' })

        this.processes.push(process)

        if (outputStream) {
            logger.info('No STDOUT logging')
            process.stdout.pipe(outputStream)
        } else if (json) {
            process.stdout.on('data', (data) => {
                const strData = data.toString()
                stdout.push(strData)
                logger.info('STDOUT ' + strData)
            })
        }

        process.stderr.on('data', data => {
            const strData = data.toString()
            stderr.push(strData)
            logger.info('STDERR ' + strData)
        })

        try {
            const [exitCode]: [number] = await once(process, 'exit') as [number]
            logger.info('Exiting with code ' + exitCode)
            if (exitCode > 0) {
                throw new Error('Restic error : ' + stderr.join('\n'))
            }
        } catch (e) {
            logger.info('Error', { error: e })
            throw e
        } finally {
            this.processes.splice(this.processes.indexOf(process), 1)
        }

        if (!json) {
            return
        }

        return multilineJson ? stdout.map((line) => JSON.parse(line)) : JSON.parse(stdout.join(''))
    }

    public terminateAll() {
        this.processes.forEach(process => process.kill('SIGINT'))
    }
}



