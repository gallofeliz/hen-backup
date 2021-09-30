import { durationToSeconds } from './utils'
import cron from 'cron-parser'

export default class FnScheduler {
    protected fn: Function
    protected schedules: string[]
    protected runOnStart: boolean
    protected timeoutId: NodeJS.Timeout | null = null

    constructor(fn: Function, schedules: string[], runOnStart: boolean) {
        this.fn = fn
        this.schedules = schedules
        this.runOnStart = runOnStart
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

    protected run(starting = false) {
        this.timeoutId = setTimeout(() => this.run(), this.getNextScheduleTime() * 1000)

        if (starting && !this.runOnStart) {
            return
        }

        this.fn()
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
