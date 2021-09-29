import { durationToSeconds } from './utils'
import cron from 'cron-parser'

interface Schedule {
    fn: Function
    schedules: string[]
    runOnStart: boolean
    timeoutId: null | NodeJS.Timeout
}

export default class FnScheduler {
    protected schedules: Schedule[] = []

    constructor() {
    }

    public schedule(fn: Function, schedules: string[], runOnStart: boolean) {
        this.schedules.push({
            fn,
            schedules,
            runOnStart,
            timeoutId: null
        })
    }

    protected getNextScheduleTime(schedules: string[]): number {
        const now = (new Date).getTime()

        const nextTimes = schedules.map(schedule => {
            if (schedule.includes(' ')) {
                return cron.parseExpression(schedule).next().getTime() - now
            }

            return durationToSeconds(schedule)
        })

        return nextTimes.sort()[0]
    }

    protected configure(schedule: Schedule) {
        schedule.timeoutId = setTimeout(() => this.run(schedule), this.getNextScheduleTime(schedule.schedules) * 1000)

        if (schedule.runOnStart) {
            this.run(schedule)
        }
    }

    protected run(schedule: Schedule) {
        schedule.timeoutId = setTimeout(() => this.run(schedule), this.getNextScheduleTime(schedule.schedules) * 1000)

        schedule.fn()
    }

    protected reset(schedule: Schedule) {
        if (schedule.timeoutId) {
            clearTimeout(schedule.timeoutId)
        }

        schedule.timeoutId = null
    }

    public start() {
        this.schedules.forEach(schedule => this.configure(schedule))
    }

    public stop() {
        this.schedules.forEach(schedule => this.reset(schedule))
    }
}
