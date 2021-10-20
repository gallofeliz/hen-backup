import { durationToSeconds } from './utils'
import chokidar from 'chokidar'
import { Logger } from './logger'

interface WaitPending {
    start: number
    timeout: NodeJS.Timeout
}

export default class FsWatcher {
    protected fn: Function
    protected paths: string[]
    protected ignore: string[]
    protected waitMinMs: number | null
    protected waitMaxMs: number | null
    protected watcher: chokidar.FSWatcher | null = null
    protected waitPending: WaitPending | null = null
    protected logger: Logger

    constructor(fn: Function, logger: Logger, paths: string[], ignore?: string[], waitMin?: string, waitMax?: string) {
        this.fn = fn
        this.paths = paths
        this.logger = logger
        this.ignore = ignore || []
        this.waitMinMs = waitMin ? durationToSeconds(waitMin) * 1000 : null
        this.waitMaxMs = waitMax ? durationToSeconds(waitMax) * 1000 : this.waitMinMs
    }

    public start() {
        if (this.watcher) {
            return
        }

        this.watcher = chokidar.watch(this.paths, {
            ignored: this.ignore,
            ignoreInitial: true
        }).on('all', (e, p) => {
            this.onFileEvent()
        })
    }

    public stop() {
        if (!this.watcher) {
            return
        }

        this.watcher.close()
        this.watcher = null

        if (this.waitPending) {
            clearTimeout(this.waitPending.timeout)
            this.waitPending = null
        }
    }

    protected async run() {
        if (this.waitPending) {
            clearTimeout(this.waitPending.timeout)
            this.waitPending = null
        }

        try {
            await this.fn()
        } catch (e) {
            // Thanks to async/await I can cheat with no promise ahah
            this.logger.error('Fn call fails', {fn: this.fn.toString(), error: e})
        }
    }

    // TODO FIX BAD LOGIC
    protected onFileEvent() {
        if (!this.waitMinMs) {
            return this.run()
        }

        const now = (new Date).getTime()

        if (!this.waitPending) {
            this.waitPending = {
                start: now,
                timeout: setTimeout(() => this.run(), this.waitMinMs)
            }
            return
        }

        if (this.waitPending.start + this.waitMaxMs! > now) {
            clearTimeout(this.waitPending.timeout)
            this.waitPending.timeout = setTimeout(() => this.run(), this.waitMinMs) // TODO calc remaining
            return
        }

        this.run()
    }
}
