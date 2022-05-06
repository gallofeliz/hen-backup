import { JobsRegistry, JobsRunner, Job as JsLibsJob, JobOpts as JsLibsJobOpts } from 'js-libs/jobs'
export { JobPriority } from 'js-libs/jobs'
import { Logger } from 'js-libs/logger'
import { sizeToKiB, durationToSeconds } from 'js-libs/utils'
import { isEqual, pick } from 'lodash'

export interface JobIdentity {
    trigger: 'scheduler' | 'api' | null
    operation: string
    subjects: Record<string, string>
}

export class Job<Result> extends JsLibsJob<JobIdentity, Result> {}
export type JobOpts = JsLibsJobOpts<JobIdentity>

export default class JobsService {
    protected jobsRunner: JobsRunner<Job<any>>
    protected jobsRegistry: JobsRegistry<Job<any>>
    protected logger: Logger

    constructor(
        {jobsRunner, jobsRegistry, logger}:
        {jobsRunner: JobsRunner<Job<any>>, jobsRegistry: JobsRegistry<Job<any>>,  logger: Logger}
    ) {
        this.jobsRegistry = jobsRegistry
        this.jobsRunner = jobsRunner
        this.logger = logger
    }

    public async start() {
        await this.jobsRunner.start()
    }

    public async stop() {
        await this.jobsRunner.stop()
    }

    public run<Result>(jobOpts: JobOpts, getResult = false) {
        const jsLibJobOpts: JsLibsJobOpts<JobIdentity> = { priority: 'normal', ...jobOpts }

        const equalJob = this.jobsRunner.getQueuingJobs().find(inQueueJob => {
            return isEqual(
                pick(inQueueJob.getId(), 'operation', 'subjects'),
                pick(jobOpts.id, 'operation', 'subjects')
            )
        })

        if (equalJob) {
            if (equalJob.getPriority() === jobOpts.priority) {
                return getResult
                    ? equalJob.toPromise()
                    : undefined
            }
            this.logger.info('Requested job already in queue but with different priority, canceling previous', { id: jobOpts.id })
            equalJob.cancel()
        }

        const job = new Job<Result>(jsLibJobOpts)

        this.jobsRegistry.addJob(job)

        return getResult
            ? this.jobsRunner.run<Result>(job, true)
            : this.jobsRunner.run(job, false)
    }

    public getJobs() {
        return this.jobsRegistry.getJobsByRunState()
    }

    public getJob(uuid: string) {
        return this.jobsRegistry.getJob(uuid)
    }
}
