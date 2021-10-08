import { EventEmitter } from 'events'
import { v4 as uuid4 } from 'uuid'
import { Logger } from './logger'

export class Job extends EventEmitter {
    protected trigger: string | null
    protected operation: string
    protected subjects: Record<string, string>
    protected priority: string | number
    protected fn: (job: Job) => Promise<any>
    protected state: 'new' | 'running' | 'aborting' | 'success' | 'failure' | 'aborted' | 'canceled' = 'new'
    protected result: Promise<any>
    protected uuid: string = uuid4()
    protected createdAt: Date = new Date
    protected resolve?: (data: any) => void
    protected reject?: (error: Error) => void
    protected logger: Logger

    constructor(
        { trigger, operation, subjects, fn, priority = 'normal', logger }:
        {
            trigger: string | null,
            operation: string,
            subjects: Record<string, string>,
            fn: (job: Job) => Promise<any>,
            logger: Logger,
            priority?: string
        }
    ) {
        super()

        if (!['immediate', 'next', 'superior', 'normal', 'inferior', 'on-idle'].includes(priority) && !Number.isFinite(priority)) {
            throw new Error('Invalid priority')
        }

        this.trigger = trigger
        this.operation = operation
        this.subjects = subjects
        this.priority = priority
        this.fn = fn
        this.result = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })

        this.logger = logger.child({
            job: {
                uuid: this.uuid,
                operation: this.operation,
                subjects: this.subjects
            }
        })

        this.logger.info('Job creation', {
            jobState: this.state
        })
    }

    public getState() {
        return this.state
    }

    public getPriority() {
        return this.priority
    }

    public getTrigger() {
        return this.trigger
    }

    public getLogger() {
        return this.logger
    }

    public getUuid() {
        return this.uuid
    }

    public getOperation() {
        return this.operation
    }

    public getSubjects() {
        return this.subjects
    }

    public getCreatedAt() {
        return this.createdAt
    }

    public async run() {
        if (this.state !== 'new') {
            throw new Error('Already started')
        }

        this.state = 'running'
        this.logger.info('Let\'s run the job !', {
            jobState: this.state
        })

        try {
            const result = await this.fn(this)

            // Stupid Typescript ...
            if ((this.state as string) === 'aborting') {
                throw new Error('Aborted')
            }

            this.resolve!(result)
            this.state = 'success'
            this.logger.info('Success :)', {
                jobState: this.state
            })
        } catch (e) {
            this.state = (this.state as string) === 'aborting' ? 'aborted' : 'failure'
            this.logger.info('failure', {
                jobState: this.state
            })
            this.reject!(e as Error)
        }

        this.removeAllListeners('abort')

        return this.getResult()
    }

    public async getResult() {
        return this.result
    }

    public abort() {
        if (this.state !== 'running') {
            return
        }

        if (this.listenerCount('abort') === 0) {
            throw new Error('Abort not handled')
        }

        this.state = 'aborting'
        this.logger.info('Requested abort', {
            jobState: this.state
        })
        this.emit('abort')
    }

    public cancel() {
        if (this.state !== 'new') {
            throw new Error('Unable to cancel a non-new job')
        }

        this.state = 'canceled'
        this.logger.info('Requested cancel', {
            jobState: this.state
        })
        this.reject!(new Error('Canceled'))
    }
}

export default class JobsManager {
    protected queue: Job[] = []
    protected running: Job[] = []
    protected history: Job[] = new Array(20)
    protected started = false
    protected logger: Logger

    public constructor(logger: Logger) {
        this.logger = logger
    }

    public start() {
        if (this.started) {
            return
        }

        this.started = true
        this.runNext()
    }

    public stop() {
        this.queue = []
        this.started = false
        this.running.forEach(job => job.abort())
    }

    public getHistory() {
        return this.history
    }

    public addJob(job: Job, canBeDuplicate: boolean = false, getResult = false) {
        if (job.getState() !== 'new') {
            throw new Error('Job already started')
        }

        if (this.queue.includes(job)) {
            return
        }

        this.history.shift()
        this.history.push(job)

        if (!canBeDuplicate) {
            const equalJob = this.queue.find(inQueueJob => {
                return inQueueJob.getOperation() === job.getOperation()
                    && inQueueJob.getSubjects() === job.getSubjects()
            })

            if (equalJob) {
                if (equalJob.getPriority() === job.getPriority()) {
                    this.logger.info('Not queueing job because of duplicate', { job: job.getUuid() })
                    job.cancel()
                    return
                }
                this.queue.splice(this.queue.indexOf(equalJob), 1)
                this.logger.info('Canceling previous job on duplicate', { job: job.getUuid(), previousJob: job.getUuid() })
                equalJob.cancel()
            }
        }

        this.logger.info('Queueing job', { job: job.getUuid() })

        if (this.started && job.getPriority() === 'immediate' && this.queue.length > 0) {
            this.run(job)
        } else {
            let index = 0
            for (const jjob of this.queue) {
                if (this.isPrioSup(job, jjob)) {
                    break
                }
                index++
            }

            this.queue.splice(index, 0, job)
            this.runNext()
        }

        if (getResult) {
            return job.getResult()
        }

        job.getResult().catch(() => {})
    }

    protected isPrioSup(jobA: Job, jobB: Job): boolean {
        let priorityA = jobA.getPriority()
        let priorityB = jobB.getPriority()

        if (priorityA === 'immediate') {
            return true
        }

        if (priorityA === 'next' && priorityB != 'immediate') {
            return true
        }

        if (priorityA === 'on-idle') {
            return false
        }

        if (priorityB === 'immediate' || priorityB === 'next') {
            return false
        }

        if (priorityB === 'on-idle') {
            return true
        }

        if (priorityA === 'normal') {
            priorityA = 0
        }

        if (priorityB === 'normal') {
            priorityB = 0
        }

        if (priorityA === 'superior' && priorityB != 'superior') {
            return true
        }

        if (priorityA === 'inferior' && priorityB != 'inferior') {
            return false
        }

        if (priorityB === 'superior' && priorityA != 'superior') {
            return false
        }

        if (priorityB === 'inferior' && priorityA != 'inferior') {
            return true
        }

        return priorityA > priorityB
    }

    protected runNext() {
        if (!this.started) {
            return
        }

        if (this.queue.length === 0) {
            return
        }

        if (this.running.length > 0) {
            return
        }

        this.run(this.queue.shift() as Job)
    }

    protected async run(job: Job) {
        this.running.push(job)

        try {
            await job.run()
        } catch(e) {}

        this.running.splice(this.running.indexOf(job))

        this.runNext()
    }
}
