import { JobsRegistry, JobsRunner, Job as JsLibsJob, JobOpts as JsLibsJobOpts, JobPriority } from 'js-libs/jobs'
export { JobPriority } from 'js-libs/jobs'
import { Logger } from 'js-libs/logger'
import { sizeToKiB, durationToSeconds } from 'js-libs/utils'
import { isEqual, pick, mapValues } from 'lodash'

export interface JobIdentity {
    trigger: 'scheduler' | 'api' | 'fswatcher' | null
    operation: string
    subjects: Record<string, string>
}

export class Job<Result> extends JsLibsJob<JobIdentity, Result> {}
export type JobOpts = JsLibsJobOpts<JobIdentity>

type JobRunnerState = 'queueing' | 'running' | 'ended'

interface FindCriteria {
    runState?: JobRunnerState,
    operation?: string,
    someSubjects?: Record<string, string>
}

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

    public run<Result>(jobOpts: JobOpts, getResult = false, allowDuplicate = false) {
        const jsLibJobOpts = { priority: 'normal' as JobPriority, keepResult: false, ...jobOpts }

        if (!allowDuplicate) {
            const equalJob = this.jobsRunner.getQueuingJobs().find(inQueueJob => {
                return isEqual(
                    pick(inQueueJob.getId(), 'operation', 'subjects'),
                    pick(jobOpts.id, 'operation', 'subjects')
                )
            })

            if (equalJob) {
                this.logger.info('Requested job already in queue : if higher priority, update job in queue ; use it for this request', {
                    job: equalJob.getUuid()
                })

                if (Job.comparePriority(jsLibJobOpts.priority, equalJob.getPriority()) > 0) {
                    equalJob.prioritizeTo(jsLibJobOpts.priority)
                }

                return getResult
                    ? equalJob.toPromise()
                    : undefined
            }
        }

        const job = new Job<Result>(jsLibJobOpts)

        this.jobsRegistry.addJob(job)

        return getResult
            ? this.jobsRunner.run<Result>(job, true)
            : this.jobsRunner.run(job, false)
    }

    public getJobs(byRunState?: true): Record<JobRunnerState, Job<any>[]>
    public getJobs(byRunState: false): Job<any>[]

    public getJobs(byRunState = true) {
        if (!byRunState) {
            return this.jobsRegistry.getJobs()
        }

        const jobsByRunState = this.jobsRegistry.getJobsByRunState()

        return {
            queueing: jobsByRunState.ready,
            running: jobsByRunState.running,
            ended: jobsByRunState.ended
        }
    }

    public getJob(uuid: string) {
        const job = this.jobsRegistry.getJob(uuid)

        if (!job) {
            throw new Error('Unknown job ' + uuid)
        }

        return job
    }

    public findJobs(criteria: FindCriteria, byRunState?: true): Record<JobRunnerState, Job<any>[]>
    public findJobs(criteria: FindCriteria, byRunState: false): Job<any>[]

    public findJobs(
        criteria: FindCriteria,
        byRunState = true
    ) {
        return byRunState
            ? mapValues(this.getJobs(true), jobs => this.filterJobs(jobs, criteria))
            : this.filterJobs(this.getJobs(false), criteria)
    }

    // public findJob(criteria: FindCriteria) {
    //     const jobs = this.findJobs(criteria, false)

    //     return jobs.length ? jobs[0] : null
    // }

    protected filterJobs(jobs: Job<any>[], criteria: FindCriteria): Job<any>[] {
        return jobs.filter(job => {
            if (criteria.runState && job.getRunState() !== criteria.runState) {
                return false
            }
            if (criteria.operation && job.getId().operation !== criteria.operation) {
                return false
            }
            if (criteria.someSubjects && !isEqual(criteria.someSubjects, pick(job.getId().subjects, ...Object.keys(criteria.someSubjects)))) {
                return false
            }
            return true
        })
    }
}
