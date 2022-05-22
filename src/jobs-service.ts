import {
    JobsRunner, Job as JsLibsJob, JobOpts as JsLibsJobOpts, JobPriority, InMemoryJobsCollection,
    FilePersistedJobsCollection, JobsCollectionQuery, JobsCollectionSort
} from 'js-libs/jobs'
export { JobPriority, semanticJobPriorities } from 'js-libs/jobs'
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

/*
export class JobsRegistry<RegisteredJob extends Job> {
    protected maxNbEnded?: number
    protected maxEndDateDurationSeconds?: number
    // protected readyOrRunningJobs: Job<any, any>[] = []
    // protected endedJobs: Job<any, any>[] = []
    protected jobs: RegisteredJob[] = []
    //protected nextRemoveExceedEndedTimeout?: NodeJS.Timeout
    protected logger: Logger
    protected jobsEndedCollection?: JobsCollection<RegisteredJob>

    constructor(
        { maxNbEnded, maxEndDateDuration, logger, jobsEndedCollection }:
        { maxNbEnded?: number, maxEndDateDuration?: Duration, logger:Logger, jobsEndedCollection?: JobsCollection<RegisteredJob> }
    ) {
        this.maxEndDateDurationSeconds = maxEndDateDuration ? durationToSeconds(maxEndDateDuration) : undefined
        this.maxNbEnded = maxNbEnded
        this.logger = logger
        this.jobsEndedCollection = jobsEndedCollection

        this.loadEndedJobs()
    }

    protected async loadEndedJobs() {
        if (!this.jobsEndedCollection) {
            return
        }

        try {
            this.jobs.push(...await this.jobsEndedCollection.find({}))
        } catch (e) {
            this.logger.error('Unable to load ended jobs')
        }
    }

    protected async persistEndedJob(job: RegisteredJob) {
        if (!this.jobsEndedCollection) {
            return
        }

        try {
            await this.jobsEndedCollection.insert(job)
        } catch (e) {
            this.logger.error('Unable persist ended job')
        }
    }

    protected async unpersistEndedJobs(jobs: RegisteredJob[]) {
        if (!this.jobsEndedCollection) {
            return
        }

        try {
            await this.jobsEndedCollection.remove({ uuid: { $in : jobs.map(j => j.getUuid()) } })
        } catch (e) {
            this.logger.error('Unable to unpersist ended job')
        }
    }

    // public addJob(job: Job<any, any>) {
    //     if (job.getRunState() === 'ended') {
    //         const olderIndex = this.endedJobs.findIndex((job2) => job2.getEndedAt()! > job.getEndedAt()!)
    //         if (!olderIndex) {
    //             this.endedJobs.push(job)
    //         } else {
    //             this.endedJobs.splice(olderIndex, 0, job)
    //         }
    //         this.removeExceedEnded()
    //     } else {
    //         this.readyOrRunningJobs.push(job)
    //         job.once('ended', () => this.removeExceedEnded())
    //     }
    // }

    public addJob(job: RegisteredJob) {
        if (this.jobs.includes(job)) {
            return
        }

        this.jobs.push(job)
        this.logger.info('Registering job', { job: job.getUuid() })

        if (job.getRunState() === 'ended') {
            this.persistEndedJob(job)
            this.removeExceedEnded()
        } else {
            const onError = () => {} // Registry avoid to need to catch ;)
            job.once('error', onError)
            job.once('ended', () => {
                job.off('error', onError)
                this.persistEndedJob(job)
                this.removeExceedEnded()
            })
        }
    }

    public getJobs() {
        this.removeExceedEnded()
        return this.jobs
    }

    public getJobsByRunState(): Record<JobRunState, RegisteredJob[]> {
        return {
            ready: [],
            running: [],
            ended: [],
            ..._.groupBy(this.getJobs(), (job) => job.getRunState())
        }
    }

    public getJob(uuid: string) {
        return this.getJobs().find(job => job.getUuid() === uuid)
    }

    protected removeExceedEnded() {
        const endedJobs = _.sortBy(this.jobs.filter((job) => job.getRunState() === 'ended'), (job) => job.getEndedAt())
        const jobsToRemove: RegisteredJob[] = []

        if (this.maxNbEnded) {
            jobsToRemove.push(..._.dropRight(endedJobs, this.maxNbEnded))
        }

        if (this.maxEndDateDurationSeconds) {
            const nowTime = (new Date).getTime()
            jobsToRemove.push(..._.takeWhile(endedJobs, (job) => (job.getEndedAt()!.getTime() + this.maxEndDateDurationSeconds! * 1000) < nowTime))

            // const stillEndedJobs = _.without(endedJobs, ...jobsToRemove)
            // if (stillEndedJobs.length > 0) {
            //     const nextTimeout = stillEndedJobs[0].getEndedAt()!.getTime() + this.maxEndDateDurationSeconds * 1000 - (new Date).getTime()
            // }
        }

        if (!jobsToRemove.length) {
            return
        }

        this.logger.info('Cleaning jobs', { jobs: jobsToRemove.map(j => j.getUuid()) })
        this.jobs = _.without(this.jobs, ...jobsToRemove)
        this.unpersistEndedJobs(jobsToRemove)
    }
}


*/
export default class JobsService {
    protected jobsRunner: JobsRunner<Job<any>>
    protected logger: Logger
    protected notEndedJobsCollection: InMemoryJobsCollection<Job<any>>
    protected endedJobsCollection: FilePersistedJobsCollection<Job<any>>

    constructor(
        {jobsRunner, logger, jobsDbPath}:
        {jobsRunner: JobsRunner<Job<any>>, logger: Logger, jobsDbPath: string}
    ) {
        this.jobsRunner = jobsRunner
        this.logger = logger
        this.endedJobsCollection = new FilePersistedJobsCollection(jobsDbPath)
        this.notEndedJobsCollection = new InMemoryJobsCollection()
    }

    public async start() {
        await this.jobsRunner.start()
    }

    public async stop() {
        await this.jobsRunner.stop(true, true)
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

        this.notEndedJobsCollection.insert(job)

        // Hello, I will handle errors myself, don't crash !!
        const onError = () => {}
        job.once('error', onError)

        job.once('ended', () => {
            job.off('error', onError)
            this.notEndedJobsCollection.remove({ uuid: job.getUuid() })
            this.endedJobsCollection.insert(job)
        })

        return getResult
            ? this.jobsRunner.run<Result>(job, true)
            : this.jobsRunner.run(job, false)
    }

    public async findQueuingJobs(query: JobsCollectionQuery, sort?: JobsCollectionSort, limit?: number, skip?: number) {
        return this.notEndedJobsCollection.find({...query, runState: 'ready' }, sort, limit, skip)
    }

    public async findRunningJobs(query: JobsCollectionQuery, sort?: JobsCollectionSort, limit?: number, skip?: number) {
        return this.notEndedJobsCollection.find({...query, runState: 'running' }, sort, limit, skip)
    }

    public async findEndedJobs(query: JobsCollectionQuery, sort?: JobsCollectionSort, limit?: number, skip?: number) {
        return this.endedJobsCollection.find(query, sort, limit, skip)
    }

    public async findQueuingJob(query: JobsCollectionQuery, sort?: JobsCollectionSort) {
        return this.notEndedJobsCollection.findOne({...query, runState: 'ready' }, sort)
    }

    public async findRunningJob(query: JobsCollectionQuery, sort?: JobsCollectionSort) {
        return this.notEndedJobsCollection.findOne({...query, runState: 'running' }, sort)
    }

    public async findEndedJob(query: JobsCollectionQuery, sort?: JobsCollectionSort) {
        return this.endedJobsCollection.findOne(query, sort)
    }

    public async getJob(uuid: string) {
        const job = await this.notEndedJobsCollection.findOne({uuid}) || await this.endedJobsCollection.findOne({uuid})

        if (!job) {
            throw new Error('Unknown job ' + uuid)
        }

        return job
    }

    public async cancel(uuid: string, trigger: 'api') {
        (await this.getJob(uuid)).cancel('Requested by ' + trigger)
    }

    public async abort(uuid: string, trigger: 'api') {
        (await this.getJob(uuid)).abort('Requested by ' + trigger)
    }
}
