import { durationToSeconds } from './utils'
import cron from 'cron-parser'
import { Logger } from './logger'

export default class FnScheduler {
    protected fn: Function
    protected schedules: string[]
    protected runOnStart: boolean
    protected timeoutId: NodeJS.Timeout | null = null
    protected logger: Logger

    constructor(fn: Function, logger: Logger, schedules: string[], runOnStart: boolean) {
        this.fn = fn
        this.schedules = schedules
        this.runOnStart = runOnStart
        this.logger = logger
    }

    protected getNextScheduleTime(): number {
        const now = (new Date).getTime()

        const nextTimes = this.schedules.map(schedule => {
            if (schedule.includes(' ')) {
                return cron.parseExpression(schedule).next().getTime() - now
            }

            return durationToSeconds(schedule)
        })

        return nextTimes.sort()[0]
    }

    protected async run(starting = false) {
        // We also can put at the end to avoid multiple exec
        this.timeoutId = setTimeout(() => this.run(), this.getNextScheduleTime() * 1000)

        if (starting && !this.runOnStart) {
            return
        }

        try {
            await this.fn()
        } catch (e) {
            // Thanks to async/await I can cheat with no promise ahah
            this.logger.error('Fn call fails', {fn: this.fn.toString(), error: e})
        }
    }

    public start() {
        if (this.timeoutId) {
            return
        }

        this.run(true)
    }

    public stop() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
        }

        this.timeoutId = null
    }
}
