import JobsService, { JobPriority, Job } from './jobs-service'
import ResticClient, { ResticRepository } from './restic-client'
import { NetworkLimit } from './application'
import FnScheduler, { Schedule } from 'js-libs/fn-scheduler'
import { Logger } from 'js-libs/logger'
import { zipObject } from 'lodash'
import httpRequest, { HttpRequestConfig } from 'js-libs/http-request'
import jsonata from 'jsonata'
import runProcess from 'js-libs/process'

export interface RepositorySizeHttpMeasurement extends Pick<HttpRequestConfig, 'url' | 'method' | 'timeout' | 'retries' | 'outputType'> {
    type: 'http'
    jsonQuery?: string
}

export interface RepositorySizeAutoMeasurement {
    type: 'auto'
}

export type RepositorySizeMeasurement = RepositorySizeHttpMeasurement | RepositorySizeAutoMeasurement // | FsMeasurement => du

export interface Repository extends ResticRepository {
    name: string
    check?: {
        schedules?: Schedule[]
        priority?: JobPriority
    }
    sizeMeasurement?: {
        schedules?: Schedule[]
        priority?: JobPriority
    } & RepositorySizeMeasurement
}

export interface RepositoriesSummary {
    [repositoryName: string]: {
        checkRepository: {
            lastEndedJob: Job<void> | undefined
            runningJob: Job<void> | undefined
            queuingJob: Job<void> | undefined
            nextSchedule: Date | undefined | null
        },
        sizeMeasurement: {
            lastEndedJob: Job<number> | undefined
        }
    }
}

export default class RepositoriesService {
    protected jobsService: JobsService
    protected resticClient: ResticClient
    protected repositories: Repository[]
    protected networkLimit: NetworkLimit
    protected schedulers: FnScheduler[] = []
    protected logger: Logger
    protected started: boolean = false

    constructor(
        {jobsService, resticClient, repositories, networkLimit, logger}:
        {jobsService: JobsService, resticClient: ResticClient, repositories: Repository[], networkLimit: NetworkLimit, logger: Logger }
    ) {
        this.jobsService = jobsService
        this.resticClient = resticClient
        this.repositories = repositories
        this.networkLimit = networkLimit
        this.logger = logger

        this.schedulers.push(
            ...this.repositories
                .filter((repository) => repository.check?.schedules)
                .map((repository) => new FnScheduler({
                    id: { operation: 'checkRepository', repository: repository.name },
                    fn: () => this.checkRepository(repository.name, 'scheduler'),
                    logger: this.logger,
                    schedules: repository.check!.schedules!,
                    runOnStart: true
                }))
        )

        this.schedulers.push(
            ...this.repositories
                .filter((repository) => repository.sizeMeasurement?.schedules)
                .map((repository) => new FnScheduler({
                    id: { operation: 'measureRepositorySize', repository: repository.name },
                    fn: () => this.measureRepositorySize(repository.name, 'scheduler'),
                    logger: this.logger,
                    schedules: repository.sizeMeasurement!.schedules!,
                    runOnStart: true
                }))
        )
    }

    public async start() {
        this.started = true
        await this.initRepositories()

        // Yes it can happen !
        if (!this.started) {
            throw new Error('Interrupted start')
        }

        this.schedulers.forEach(fnSch => fnSch.start())
    }

    public async stop() {
        this.started = false
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
        try {
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
        } catch {}
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

    public measureRepositorySize(repositoryName: string, trigger: 'scheduler' | 'api', priority?: JobPriority) {
        const repository = this.getRepository(repositoryName)

        if (!repository.sizeMeasurement) {
            throw new Error('Undefined sizeMeasurement on repository ' + repository.name)
        }

        this.jobsService.run<number>({
            priority: priority || repository.sizeMeasurement.priority,
            id: {
                trigger,
                operation: 'measureRepositorySize',
                subjects: { repository: repository.name }
            },
            keepResult: true,
            logger: this.logger,
            fn: async ({abortSignal, logger}) => {

                // Typescript cause, I don't know what to do more simple
                if (!repository.sizeMeasurement) {
                    return
                }

                switch(repository.sizeMeasurement.type) {
                    case 'http':

                        let result: unknown = await httpRequest({outputType: 'auto', ...repository.sizeMeasurement, abortSignal, logger})

                        if (repository.sizeMeasurement.jsonQuery && typeof result === 'object') {
                            result = jsonata(repository.sizeMeasurement.jsonQuery).evaluate(result)
                        }

                        if (typeof result === 'string' && /^[0-9]+$/.test(result)) {
                            result = parseInt(result, 10)
                        }

                        if (typeof result !== 'number') {
                            throw new Error('Expected Http result to be a number or number-like string, received ' + JSON.stringify(result))
                        }

                        return result
                    case 'auto':

                        const { provider, container, path } = this.resticClient.explainLocation(repository.location)

                        switch(provider) {
                            case 'fs':
                                const processResult: string = await runProcess({
                                    cmd: 'du',
                                    args: ['-s', path],
                                    outputType: 'text',
                                    abortSignal,
                                    logger
                                }, true)

                                const cols = processResult.split('\t')

                                return parseInt(cols[0], 10) * 1024
                            case 'os':
                                if (path !== '/') {
                                    throw new Error('This sizeMeasurer only works with root bucket path')
                                }

                                try {
                                    const SwiftClient = require('openstack-swift-client');
                                    const authenticator = new SwiftClient.KeystoneV3Authenticator({
                                      endpointUrl: repository.locationParams?.authUrl,
                                      username: repository.locationParams?.username,
                                      password: repository.locationParams?.password,
                                      domainId: repository.locationParams?.projectDomainId,
                                      projectId: repository.locationParams?.projectId,
                                      regionId: repository.locationParams?.regionName
                                    })

                                    const client = new SwiftClient(authenticator);
                                    const swiftContainers: Array<{bytes: number, name: string}> = await client.list();

                                    //const ovhShortContainers: OvhContainer[] = await ovh.requestPromised('GET', '/cloud/project/' + encodeURIComponent(repository.locationParams?.projectId!) + '/storage')

                                    const swiftContainer = swiftContainers.find(swiftContainer => swiftContainer.name === container)

                                    if (!swiftContainer) {
                                        throw new Error('Unable to find ' + container)
                                    }

                                    return swiftContainer.bytes

                                } catch (e) {
                                    // Swift Error are very riched on informations, sensible and cyclic ref
                                    throw new Error((e as Error).message)
                                }
                            default:
                                throw new Error('Unhandled ' + provider)
                        }

                    default:
                        throw new Error('We should not reach here')
                }
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
                    },
                    sizeMeasurement: {
                        lastEndedJob: await this.jobsService
                            .findEndedJob({'id.operation': 'measureRepositorySize', 'id.subjects.repository': repository.name}, {endedAt: -1})
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
