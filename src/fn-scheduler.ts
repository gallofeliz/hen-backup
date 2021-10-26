import { durationToSeconds } from './utils'
import cron from 'cron-parser'
import { Logger } from './logger'

export default class FnScheduler {
    protected fn: Function
    protected id: any
    protected schedules: string[]
    protected runOnStart: boolean
    protected timeoutId: NodeJS.Timeout | null = null
    protected timeoutNextDate: Date | null = null
    protected logger: Logger

    constructor(id: any, fn: Function, logger: Logger, schedules: string[], runOnStart: boolean) {
        this.id = id
        this.fn = fn
        this.schedules = schedules
        this.runOnStart = runOnStart
        this.logger = logger
    }

    public getId() {
        return this.id
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
        this.timeoutNextDate = null
    }

    public getNextScheduledDate(): Date | null {
        return this.timeoutNextDate
    }

    protected getNextScheduleTime(): number {
        const now = (new Date).getTime()

        const nextTimes = this.schedules.map(schedule => {
            if (schedule.includes(' ')) {
                return cron.parseExpression(schedule).next().getTime() - now
            }

            return durationToSeconds(schedule) * 1000
        })

        return nextTimes.sort()[0]
    }

    protected async run(starting = false) {
        // We also can put at the end to avoid multiple exec
        const nextTime = this.getNextScheduleTime()
        this.timeoutId = setTimeout(() => this.run(), nextTime)
        this.timeoutNextDate = new Date((new Date).getTime() + nextTime)

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
}
