// import JobsService, { JobPriority, Job } from './jobs-service'
// import FnScheduler, { Schedule } from 'js-libs/fn-scheduler'
// import { Logger } from 'js-libs/logger'
// import { zipObject } from 'lodash'
// import httpRequest, { HttpRequestConfig } from 'js-libs/http-request'
// import jsonata from 'jsonata'
// import { NetworkLimit } from './application'

// export interface BillingHttpMeasurement extends Pick<HttpRequestConfig, 'url' | 'method' | 'timeout' | 'retries' | 'outputType'> {
//     type: 'http'
//     jsonQuery?: string
// }

// export interface BillingAmount {
//     value: number
//     currency: string
// }

// export type BillingAmountMeasurement = BillingHttpMeasurement

// export interface BillingSummary {
//     currentMonthUsage: {
//         lastEndedJob: Job<BillingAmount> | undefined
//     }
//     estimatedCurrentMonthBilling: BillingAmount | undefined
//     previousMonthBilling: {
//         lastEndedJob: Job<BillingAmount> | undefined
//     }
// }

// export interface BillingMeasurement {
//     currentMonthUsage?: {
//         schedules?: Schedule[]
//         priority?: JobPriority
//     } & BillingAmountMeasurement
//     previousMonthBilling?: {
//         schedules?: Schedule[]
//         priority?: JobPriority
//     } & BillingAmountMeasurement
// }

// export default class BillingService {
//     protected jobsService: JobsService
//     protected networkLimit: NetworkLimit
//     protected schedulers: FnScheduler[] = []
//     protected logger: Logger

//     constructor(
//         {jobsService, networkLimit, logger}:
//         {jobsService: JobsService, networkLimit: NetworkLimit, logger: Logger }
//     ) {
//         this.jobsService = jobsService
//         this.networkLimit = networkLimit
//         this.logger = logger
//     }

//     public async start() {
//         this.schedulers.forEach(fnSch => fnSch.start())
//     }

//     public async stop() {
//         this.schedulers.forEach(fnSch => fnSch.stop())
//     }


//     public measureRepositorySize(repositoryName: string, trigger: 'scheduler' | 'api', priority?: JobPriority) {
//         const repository = this.getRepository(repositoryName)

//         if (!repository.sizeMeasurement) {
//             throw new Error('Undefined sizeMeasurement on repository ' + repository.name)
//         }

//         this.jobsService.run<number>({
//             priority: priority || repository.sizeMeasurement.priority,
//             id: {
//                 trigger,
//                 operation: 'measureRepositorySize',
//                 subjects: { repository: repository.name }
//             },
//             keepResult: true,
//             logger: this.logger,
//             fn: async ({abortSignal, logger}) => {

//                 // Typescript cause, I don't know what to do more simple
//                 if (!repository.sizeMeasurement) {
//                     return
//                 }

//                 switch(repository.sizeMeasurement.type) {
//                     case 'http':

//                         let result: unknown = await httpRequest({outputType: 'auto', ...repository.sizeMeasurement, abortSignal, logger})

//                         if (repository.sizeMeasurement.jsonQuery && typeof result === 'object') {
//                             result = jsonata(repository.sizeMeasurement.jsonQuery).evaluate(result)
//                         }

//                         if (typeof result === 'string' && /^[0-9]+$/.test(result)) {
//                             result = parseInt(result, 10)
//                         }

//                         if (typeof result !== 'number') {
//                             throw new Error('Expected Http result to be a number or number-like string, received ' + JSON.stringify(result))
//                         }

//                         return result
//                     case 'auto':

//                         const { provider, container, path } = this.resticClient.explainLocation(repository.location)

//                         switch(provider) {
//                             case 'fs':
//                                 const processResult: string = await runProcess({
//                                     cmd: 'du',
//                                     args: ['-s', path],
//                                     outputType: 'text',
//                                     abortSignal,
//                                     logger
//                                 }, true)

//                                 const cols = processResult.split('\t')

//                                 return parseInt(cols[0], 10) * 1024
//                             case 'os':
//                                 if (path !== '/') {
//                                     throw new Error('This sizeMeasurer only works with root bucket path')
//                                 }

//                                 try {
//                                     const SwiftClient = require('openstack-swift-client');
//                                     const authenticator = new SwiftClient.KeystoneV3Authenticator({
//                                       endpointUrl: repository.locationParams?.authUrl,
//                                       username: repository.locationParams?.username,
//                                       password: repository.locationParams?.password,
//                                       domainId: repository.locationParams?.projectDomainId,
//                                       projectId: repository.locationParams?.projectId,
//                                       regionId: repository.locationParams?.regionName
//                                     })

//                                     const client = new SwiftClient(authenticator);
//                                     const swiftContainers: Array<{bytes: number, name: string}> = await client.list();

//                                     //const ovhShortContainers: OvhContainer[] = await ovh.requestPromised('GET', '/cloud/project/' + encodeURIComponent(repository.locationParams?.projectId!) + '/storage')

//                                     const swiftContainer = swiftContainers.find(swiftContainer => swiftContainer.name === container)

//                                     if (!swiftContainer) {
//                                         throw new Error('Unable to find ' + container)
//                                     }

//                                     return swiftContainer.bytes

//                                 } catch (e) {
//                                     // Swift Error are very riched on informations, sensible and cyclic ref
//                                     throw new Error((e as Error).message)
//                                 }
//                             default:
//                                 throw new Error('Unhandled ' + provider)
//                         }

//                     default:
//                         throw new Error('We should not reach here')
//                 }
//             }
//         })
//     }

//     public async getSummary(): Promise<RepositoriesSummary> {
//         return zipObject(
//             this.repositories.map(r => r.name),
//             await Promise.all(this.repositories.map(async repository => {
//                 return {
//                     checkRepository: {
//                         lastEndedJob: await this.jobsService
//                             .findEndedJob({'id.operation': 'checkRepository', 'id.subjects.repository': repository.name}, {endedAt: -1}),
//                         runningJob: await this.jobsService
//                             .findRunningJob({'id.operation': 'checkRepository', 'id.subjects.repository': repository.name}),
//                         queuingJob: await this.jobsService
//                             .findQueuingJob({'id.operation': 'checkRepository', 'id.subjects.repository': repository.name}),
//                         nextSchedule: this.schedulers
//                             .find(scheduler => scheduler.getId().operation === 'checkRepository' && scheduler.getId().repository === repository.name)
//                             ?.getNextScheduledDate()
//                     },
//                     sizeMeasurement: {
//                         lastEndedJob: await this.jobsService
//                             .findEndedJob({'id.operation': 'measureRepositorySize', 'id.subjects.repository': repository.name}, {endedAt: -1})
//                     }
//                 }
//             }))
//         )
//     }

// }
