import { durationToSeconds } from './utils'
import chokidar from 'chokidar'

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

    constructor(fn: Function, paths: string[], ignore?: string[], waitMin?: string, waitMax?: string) {
        this.fn = fn
        this.paths = paths
        this.ignore = ignore || []
        this.waitMinMs = waitMin ? durationToSeconds(waitMin) * 1000 : null
        this.waitMaxMs = waitMax ? durationToSeconds(waitMax) * 1000 : this.waitMinMs
    }

    public start() {
        if (this.watcher) {
            return
        }

        console.log('fs watcher', this.paths, this.ignore, this.waitMinMs)

        this.watcher = chokidar.watch(this.paths, {
            ignored: this.ignore,
            ignoreInitial: true
        }).on('all', (e, p) => {
            console.log('watch event', e, p)
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

    protected run() {
        this.fn()

        if (this.waitPending) {
            clearTimeout(this.waitPending.timeout)
            this.waitPending = null
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

        if (this.waitPending.start + this.waitMaxMs! < now) {
            clearTimeout(this.waitPending.timeout)
            this.waitPending.timeout = setTimeout(() => this.run(), this.waitMinMs)
        }

        this.run()
    }
}
