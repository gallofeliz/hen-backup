import JobsService, { JobPriority, Job } from './jobs-service'
import ResticClient, { ResticRepository } from './restic-client'
import { NetworkLimit } from './application'
import FnScheduler, { Schedule } from 'js-libs/fn-scheduler'
import { Logger } from 'js-libs/logger'
import { HttpRequest } from './http-request'
import { zipObject } from 'lodash'

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

export interface RepositoriesSummary {
    [repositoryName: string]: Record<'checkRepository', {
        lastEndedJob: Job<void> | undefined
        runningJob: Job<void> | undefined
        queuingJob: Job<void> | undefined
        nextSchedule: Date | undefined | null
    }>
}

export default class RepositoriesService {
    protected jobsService: JobsService
    protected resticClient: ResticClient
    protected repositories: Repository[]
    protected networkLimit: NetworkLimit
    protected schedulers: FnScheduler[]
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

        this.schedulers = this.repositories
            .filter((repository) => repository.check?.schedules)
            .map((repository) => new FnScheduler({
                id: { operation: 'checkRepository', repository: repository.name },
                fn: () => this.checkRepository(repository.name, 'scheduler'),
                logger: this.logger,
                schedules: repository.check!.schedules!,
                runOnStart: true
            }))
    }

    public async start() {
        await this.initRepositories()
        this.schedulers.forEach(fnSch => fnSch.start())
    }

    public async stop() {
        this.schedulers.forEach(fnSch => fnSch.stop())
    }

    public getRepositories() {
        return this.repositories
    }

    public getRepository(name: string) {
        const repository = this.repositories.find((repo) => repo.name === name)

        if (!repository) {
            throw new Error('Unknown repository ' + name)
        }

        return repository
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
        const repository = this.getRepository(repositoryName)

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

    public async getSummary(): Promise<RepositoriesSummary> {
        return zipObject(
            this.repositories.map(r => r.name),
            await Promise.all(this.repositories.map(async repository => {
                return {
                    checkRepository: {
                        lastEndedJob: await this.jobsService
                            .findEndedJob({'id.operation': 'checkRepository', 'id.subjects.repository': repository.name}, {endedAt: -1}),
                        runningJob: await this.jobsService
                            .findRunningJob({'id.operation': 'checkRepository', 'id.subjects.repository': repository.name}),
                        queuingJob: await this.jobsService
                            .findQueuingJob({'id.operation': 'checkRepository', 'id.subjects.repository': repository.name}),
                        nextSchedule: this.schedulers
                            .find(scheduler => scheduler.getId().operation === 'checkRepository' && scheduler.getId().repository === repository.name)
                            ?.getNextScheduledDate()
                    }
                }
            }))
        )
    }
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
