export class Job {
    protected trigger: string | null
    protected operation: string
    protected subjects: Record<string, string>
    protected priority: string | number
    protected fn: Function
    protected state: 'new' | 'running' | 'success' | 'failure' = 'new'
    protected result: Promise<any>
    protected createdAt: Date = new Date
    protected resolve?: Function
    protected reject?: Function

    constructor(
        { trigger, operation, subjects, fn, priority = 'normal' }:
        { trigger: string | null, operation: string, subjects: Record<string, string>, fn: Function, priority?: string }
    ) {

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

        try {
            this.resolve!(await this.fn())
            this.state = 'success'
        } catch (e) {
            this.state = 'failure'
            this.reject!(e)
        }

        return this.getResult()
    }

    public async getResult() {
        return this.result
    }

    public async abort() {

    }
}

export default class JobsManager {
    protected queue: Job[] = []
    protected running: Job[] = []
    protected started = false

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

    public addJob(job: Job, canBeDuplicate: boolean = true) {
        if (job.getState() !== 'new') {
            throw new Error('Job already started')
        }

        if (this.queue.includes(job)) {
            return
        }

        if (!canBeDuplicate) {
            const equalJob = this.queue.find(inQueueJob => {
                return inQueueJob.getOperation() === job.getOperation()
                    && inQueueJob.getSubjects() === job.getSubjects()
            })

            if (equalJob) {
                if (equalJob.getPriority() === job.getPriority()) {
                    return
                }
                this.queue.splice(this.queue.indexOf(equalJob), 1)
            }
        }

        if (this.started && job.getPriority() === 'immediate' && this.queue.length > 0) {
            return this.run(job)
        }

        let index = 0
        for (const jjob of this.queue) {
            if (this.isPrioSup(job, jjob)) {
                break
            }
            index++
        }

        this.queue.splice(index, 0, job)
        this.runNext()
        return job.getResult()
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
