import JobsService, { JobPriority } from './jobs-service'
import ResticClient, { ResticRepository } from './restic-client'
import { NetworkLimit } from './application'
import FnScheduler, { Schedule } from 'js-libs/fn-scheduler'
import { Logger } from 'js-libs/logger'
import { HttpRequest } from './http-requester'

interface BaseStat {
    shareName?: string
}

interface BaseBillingStat {
    currency: string
}

interface HttpSizeStatFetch extends BaseStat, HttpRequest {
    type: 'http'
}

interface HttpBillingStatFetch extends BaseStat, HttpRequest, BaseBillingStat {
    type: 'http'
}

export type SizeStatFetch = HttpSizeStatFetch
export type BillingStatFetch = HttpBillingStatFetch

export interface Repository extends ResticRepository {
    name: string
    check?: {
        schedules?: Schedule[]
        priority?: JobPriority
    }
    usageStats?: {
        size?: SizeStatFetch
        billing?: BillingStatFetch
    }
}

export default class RepositoriesService {
    protected jobsService: JobsService
    protected resticClient: ResticClient
    protected repositories: Repository[]
    protected networkLimit: NetworkLimit
    protected checkSchedulers: FnScheduler[]
    protected logger: Logger

    constructor(
        {jobsService, resticClient, repositories, networkLimit, logger}:
        {jobsService: JobsService, resticClient: ResticClient, repositories: Repository[], networkLimit: NetworkLimit, logger: Logger }
    ) {
        this.jobsService = jobsService
        this.resticClient = resticClient
        this.repositories = repositories
        this.networkLimit = networkLimit
        this.logger = logger

        this.checkSchedulers = this.repositories
            .filter((repository) => repository.check?.schedules)
            .map((repository) => new FnScheduler({
                id: { repository: repository.name },
                fn: () => this.checkRepository(repository.name, 'scheduler'),
                logger: this.logger,
                schedules: repository.check!.schedules!,
                runOnStart: true
            }))
    }

    public async start() {
        await this.initRepositories()
        this.checkSchedulers.forEach(fnSch => fnSch.start())
    }

    public async stop() {
        this.checkSchedulers.forEach(fnSch => fnSch.stop())
    }

    public getRepositories() {
        return this.repositories
    }

    protected async initRepositories() {
        return Promise.all(this.repositories.map((repository) => this.initRepository(repository)))
    }

    protected async initRepository(repository: Repository) {
        await this.jobsService.run({
            id: {
                trigger: null,
                operation: 'initRepository',
                subjects: { repository: repository.name }
            },
            logger: this.logger,
            fn: async ({abortSignal, logger}) => {
                try {
                    await this.resticClient.initRepository({
                        logger,
                        abortSignal,
                        repository,
                        networkLimit: this.networkLimit
                    })
                } catch (e) {
                    logger.info('Repository Init failed, probably because of already initialized (ignoring)')
                }
            }
        }, true)
    }

    public checkRepository(repositoryName: string, trigger: 'scheduler' | 'api', priority?: JobPriority) {
        const repository = this.repositories.find((repo) => repo.name === repositoryName)

        if (!repository) {
            throw new Error('Unknown repository ' + repositoryName)
        }

        this.jobsService.run({
            priority: priority || repository.check?.priority,
            id: {
                trigger,
                operation: 'checkRepository',
                subjects: { repository: repository.name }
            },
            logger: this.logger,
            fn: async ({abortSignal, logger}) => {
                await this.resticClient.checkRepository({
                    logger,
                    abortSignal,
                    repository,
                    networkLimit: this.networkLimit
                })
            }
        })
    }


//     public async getRepositoriesStats() {
//         const sharedResolutions: any = {
//             size: {},
//             billing: {}
//         }

//         // TODO refacto and call parallel

//         const getStat = async (statConfig: StatFetch) => {
//             if (statConfig.type !== 'http') {
//                 throw new Error('Only http implemented')
//             }

//             return Math.round(Math.random() * 100)

//             // const request = got({
//             //     method: statConfig.method as GotMethod || 'GET',
//             //     url: statConfig.url,
//             //     timeout: statConfig.timeout ? durationToSeconds(statConfig.timeout) * 1000 : undefined,
//             //     retry: statConfig.retries || 0,
//             //     hooks: {
//             //         beforeRequest: [options  => {this.logger.info('Calling stat ' + options.url)}],
//             //         afterResponse: [response => { this.logger.info('Stat returned code ' + response.statusCode) ; return response }],
//             //         beforeError: [error => { this.logger.info('Stat returned error ' + error.message) ; return error }]
//             //     }
//             // })

//             // return request.json()
//         }

//         return await asyncReduce(Object.keys(this.config.repositories), async (stats, repositoryName) => {
//             const repositoryStatsConf = this.config.repositories[repositoryName].stats

//             return {...stats, ...{
//                 [repositoryName]: {
//                     size: repositoryStatsConf && repositoryStatsConf.size ? {
//                         value: await (async () => {
//                             if (repositoryStatsConf.size.shareName && sharedResolutions.size[repositoryStatsConf.size.shareName]) {
//                                 return sharedResolutions.size[repositoryStatsConf.size.shareName]
//                             }

//                             const resolver = getStat(repositoryStatsConf.size)

//                             if (repositoryStatsConf.size.shareName) {
//                                 sharedResolutions.size[repositoryStatsConf.size.shareName] = resolver
//                             }

//                             return resolver
//                         })(),
//                         shareName: repositoryStatsConf.size.shareName
//                     } : null,
//                     billing: repositoryStatsConf && repositoryStatsConf.billing ? {
//                         value: await (async () => {
//                             if (repositoryStatsConf.billing.shareName && sharedResolutions.billing[repositoryStatsConf.billing.shareName]) {
//                                 return sharedResolutions.billing[repositoryStatsConf.billing.shareName]
//                             }

//                             const resolver = getStat(repositoryStatsConf.billing)

//                             if (repositoryStatsConf.billing.shareName) {
//                                 sharedResolutions.billing[repositoryStatsConf.billing.shareName] = resolver
//                             }

//                             return resolver
//                         })(),
//                         currency: repositoryStatsConf.billing.currency,
//                         shareName: repositoryStatsConf.billing.shareName
//                     } : null
//                 }
//             }}
//         }, {})
//     }


}

//     public async getSummary() {

    // By resource type (repository, backup) instead ? Delegate to others services ?

//         const jobs: Record<string, any>= this.jobsManager.getJobs()

//         function findBackupJob(jobs: Job[], backupName: string) {
//             return jobs.find((job: Job) => job.getOperation() === 'backup' && job.getSubjects().backup === backupName) || null
//         }

//         function findBackupScheduler(schedulers: FnScheduler[], backupName: string) {
//             return schedulers.find(fnScheduler => fnScheduler.getId().operation === 'backup' && fnScheduler.getId().backup === backupName) || null
//         }

//         function findPruneJob(jobs: Job[], backupName: string) {
//             return jobs.find((job: Job) => job.getOperation() === 'prune' && job.getSubjects().backup === backupName) || null
//         }

//         function findPruneScheduler(schedulers: FnScheduler[], backupName: string) {
//             return schedulers.find(fnScheduler => fnScheduler.getId().operation === 'prune' && fnScheduler.getId().backup === backupName) || null
//         }

//         function findCheckJob(jobs: Job[], repositoryName: string) {
//             return jobs.find((job: Job) => job.getOperation() === 'check' && job.getSubjects().repository === repositoryName) || null
//         }

//         function findCheckScheduler(schedulers: FnScheduler[], repositoryName: string) {
//             return schedulers.find(fnScheduler => fnScheduler.getId().operation === 'check' && fnScheduler.getId().repository === repositoryName) || null
//         }

//         return {
//             backups: await asyncReduce(Object.keys(this.config.backups), async (backupsStatus, backupName) => {
//                 const lastJob = findBackupJob(jobs.archived, backupName)
//                 const running = findBackupJob(jobs.running, backupName)
//                 const queuedJob = findBackupJob(jobs.queue, backupName)
//                 const scheduler = findBackupScheduler(this.fnSchedulers, backupName)

//                 return {...backupsStatus, ...{
//                     [backupName]: {
//                         lastArchivedJob: lastJob && await lastJob.toJson(),
//                         runningJob: running && await running.toJson(),
//                         queueJob: queuedJob && await queuedJob.toJson(),
//                         nextSchedule: scheduler && scheduler.getNextScheduledDate()
//                     }
//                 }}
//             }, {}),
//             checks: await asyncReduce(Object.keys(this.config.repositories), async (checksStatus, repositoryName) => {
//                 const lastJob = findCheckJob(jobs.archived, repositoryName)
//                 const running = findCheckJob(jobs.running, repositoryName)
//                 const queuedJob = findCheckJob(jobs.queue, repositoryName)
//                 const scheduler = findCheckScheduler(this.fnSchedulers, repositoryName)

//                 return {...checksStatus, ...{
//                     [repositoryName]: {
//                         lastArchivedJob: lastJob && await lastJob.toJson(),
//                         runningJob: running && await running.toJson(),
//                         queueJob: queuedJob && await queuedJob.toJson(),
//                         nextSchedule: scheduler && scheduler.getNextScheduledDate()
//                     }
//                 }}
//             }, {}),
//             prunes: await asyncReduce(Object.keys(this.config.backups), async (prunesStatus, backupName) => {
//                 const lastJob = findPruneJob(jobs.archived, backupName)
//                 const running = findPruneJob(jobs.running, backupName)
//                 const queuedJob = findPruneJob(jobs.queue, backupName)
//                 const scheduler = findPruneScheduler(this.fnSchedulers, backupName)

//                 return {...prunesStatus, ...{
//                     [backupName]: {
//                         lastArchivedJob: lastJob && await lastJob.toJson(),
//                         runningJob: running && await running.toJson(),
//                         queueJob: queuedJob && await queuedJob.toJson(),
//                         nextSchedule: scheduler && scheduler.getNextScheduledDate()
//                     }
//                 }}
//             }, {})
//         }
//     }

