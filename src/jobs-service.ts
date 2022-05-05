import { JobsRegistry, JobsRunner, Job as BaseJob, JobOpts as BaseJobOpts } from 'js-libs/jobs'
import { Repository, Backup, Snapshot } from './definitions'
import { Logger } from 'js-libs/logger'
import { sizeToKiB, durationToSeconds } from 'js-libs/utils'
import { isEqual, pick } from 'lodash'

export interface JobIdentity {
    trigger: 'scheduler' | 'api'
    operation: string
    subjects: Record<string, string>
}

export class Job<Result> extends BaseJob<JobIdentity, Result> {}
export interface JobOpts extends BaseJobOpts<JobIdentity> {}

export default class JobsService {
    protected jobsRunner: JobsRunner
    protected jobsRegistry: JobsRegistry
    protected logger: Logger

    constructor(
        {jobsRunner, jobsRegistry, logger}:
        {jobsRunner: JobsRunner, jobsRegistry: JobsRegistry,  logger: Logger}
    ) {
        this.jobsRegistry = jobsRegistry
        this.jobsRunner = jobsRunner
        this.logger = logger
    }

    public run<Result>(jobOpts: JobOpts, getResult = false) {
        jobOpts = { priority: 'normal', ...jobOpts }

        const equalJob = this.jobsRunner.getQueuingJobs().find(inQueueJob => {
            return isEqual(
                pick(inQueueJob.getIdentity(), 'operation', 'subjects'),
                pick(jobOpts.identity, 'operation', 'subjects')
            )
        })

        if (equalJob) {
            if (equalJob.getPriority() === jobOpts.priority) {
                return getResult
                    ? equalJob.toPromise()
                    : undefined
            }
            this.logger.info('Requested job already in queue but with different priority, canceling previous', { identity: jobOpts.identity })
            equalJob.cancel()
        }

        const job = new Job<Result>(jobOpts)

        this.jobsRegistry.addJob(job)

        return getResult
            ? this.jobsRunner.run<Result>(job, true)
            : this.jobsRunner.run(job, false)
    }
}


/*
Jobs summary

    public async getSummary({withRunLogs = false, withSuccessResult = false, withWarnings = false} = {}) {
        return {
            uuid: this.getUuid(),
            createdAt: this.getCreatedAt(),
            startedAt: this.getStartedAt(),
            endedAt: this.getEndedAt(),
            state: this.getState(),
            priority: this.getPriority(),
            trigger: this.getTrigger(),
            operation: this.getOperation(),
            subjects: this.getSubjects(),
            warnings: withWarnings ? this.warnings : this.warnings.length,
            ...this.getState() === 'failure' && { error: await (this.getResult().catch(e => e.toString())) },
            ...this.getState() === 'success' && withSuccessResult && { result: await this.getResult() },
            ...withRunLogs && { runLogs: this.getRunLogs() }
        }
    }


*/


// import { Logger } from './logger'
// import { Config, Hook, StatFetch } from './config'
// import FnScheduler from './fn-scheduler'
// import JobsManager, { Job } from './jobs-manager'
// import FsWatcher from './fs-watcher'
// import Restic from './restic'
// import { once } from 'events'
// import _ from 'lodash'
// import { durationToSeconds } from './utils'
// import got, { Method as GotMethod } from 'got'
// import { reduce as asyncReduce } from 'bluebird'

// export default class Daemon {
//     protected config: Config
//     protected logger: Logger
//     protected fnSchedulers: FnScheduler[] = []
//     protected fsWatchers: FsWatcher[] = []
//     protected jobsManager: JobsManager
//     protected started = false
//     protected restic: Restic

//     constructor(config: Config, logger: Logger) {
//         this.config = config
//         this.logger = logger
//         this.jobsManager = new JobsManager(logger)
//         this.restic = new Restic({
//             uploadLimit: this.config.uploadLimit,
//             downloadLimit: this.config.downloadLimit,
//             logger: this.logger
//         })
//         this.configureTriggers()
//     }

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

//     public async getSummary() {
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
//             started: this.started,
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

//     public async getJobs() {

//         const allJobs: Record<string, any>= this.jobsManager.getJobs()

//         for (const type in allJobs) {
//             allJobs[type] = await Promise.all(allJobs[type].map((job: Job) => job.toJson()))
//         }

//         return allJobs
//     }

//     public getJob(jobUuid: string): Job {
//         return this.jobsManager.getJob(jobUuid)
//     }

//     public listSnapshots(criterias: {backupName?: string, repositoryName?: string}, trigger: 'api') {
//         if (criterias.backupName && !this.config.backups[criterias.backupName]) {
//             throw new Error('Unknown backup ' + criterias.backupName)
//         }

//         if (criterias.repositoryName && !this.config.repositories[criterias.repositoryName]) {
//             throw new Error('Unknown repository ' + criterias.repositoryName)
//         }

//         return this.jobsManager.addJob(
//             new Job({
//                 logger: this.logger,
//                 trigger: trigger,
//                 operation: 'listSnapshots',
//                 subjects: {
//                     ...criterias.backupName && {backup: criterias.backupName},
//                     ...criterias.repositoryName && {repository: criterias.repositoryName}
//                 },
//                 fn: async (job) => {
//                     const args = ['--host', this.config.hostname]

//                     if (criterias.backupName) {
//                         args.push('--tag', 'backup-' + criterias.backupName)
//                     }

//                     let searchRepositories: string[]

//                     if (criterias.repositoryName) {
//                         searchRepositories = [criterias.repositoryName]
//                     } else if (criterias.backupName) {
//                         searchRepositories = this.config.backups[criterias.backupName].repositories
//                     } else {
//                         searchRepositories = Object.keys(this.config.repositories)
//                     }

//                     let snapshots: Record<string, any>[] = []

//                     for (const repositoryName of searchRepositories) {
//                         const repository = this.config.repositories[repositoryName]

//                         await this.unlockRepository(repository, job)

//                         const resticCall = this.restic.call(
//                             'snapshots',
//                             args,
//                             {
//                                 repository: repository,
//                                 logger: job.getLogger(),
//                                 ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
//                             }
//                         )

//                         job.once('abort', () => resticCall.abort())

//                         const [resticSnapshots]: Array<Record<string, any>[]> = await once(resticCall, 'finish')
//                         snapshots = snapshots.concat(
//                             resticSnapshots.map(resticSnapshot => ({
//                                 date: resticSnapshot['time'],
//                                 //hostname: resticSnapshot['hostname'],
//                                 backup: this.extractValueFromTags(resticSnapshot.tags, 'backup'),
//                                 job: this.extractValueFromTags(resticSnapshot.tags, 'job'),
//                                 repository: repositoryName,
//                                 id: resticSnapshot['id']
//                             }))
//                         )
//                     }

//                     return _.sortBy(snapshots, 'date').reverse()
//                 },
//                 priority: 'immediate'
//             }),
//             true,
//             true
//         )
//     }

//     public getSnapshot(repositoryName: string, snapshotId: string, trigger: 'api') {
//         const repository = this.config.repositories[repositoryName]

//         if (!repository) {
//             throw new Error('Unknown repository ' + repositoryName)
//         }

//         return this.jobsManager.addJob(
//             new Job({
//                 logger: this.logger,
//                 trigger: trigger,
//                 operation: 'getSnapshot',
//                 subjects: {repository: repositoryName, snapshot: snapshotId},
//                 fn: async (job) => {
//                     await this.unlockRepository(repository, job)

//                     const resticCall = this.restic.call(
//                         'ls',
//                         [
//                             '--long',
//                             snapshotId
//                         ],
//                         {
//                             repository: repository,
//                             logger: job.getLogger(),
//                             ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
//                         }
//                     )

//                     job.once('abort', () => resticCall.abort())

//                     const [[infos, ...objects]] = await once(resticCall, 'finish')

//                     if (infos.hostname !== this.config.hostname) {
//                         throw new Error('Unknown snapshot ' + snapshotId)
//                     }

//                     return {
//                         repository: repositoryName,
//                         backup: this.extractValueFromTags(infos.tags, 'backup'),
//                         job: this.extractValueFromTags(infos.tags, 'job'),
//                         snapshot: snapshotId,
//                         objects: objects.map((o: object) => ({permissions: 'unknown', ...o}))
//                     }
//                 },
//                 priority: 'immediate'
//             }),
//             true,
//             true
//         )
//     }

//     public downloadSnapshot(
//         repositoryName: string,
//         snapshotId: string,
//         stream: NodeJS.WritableStream,
//         path: string,
//         format: 'tar' | 'zip',
//         trigger: 'api'
//     ) {
//         const repository = this.config.repositories[repositoryName]

//         if (!repository) {
//             throw new Error('Unknown repository ' + repositoryName)
//         }

//         return this.jobsManager.addJob(
//             new Job({
//                 logger: this.logger,
//                 trigger: trigger,
//                 operation: 'downloadSnapshot',
//                 subjects: {repository: repositoryName, snapshot: snapshotId, path},
//                 fn: async (job) => {
//                     await this.unlockRepository(repository, job)

//                     const resticCall = this.restic.call(
//                         'dump',
//                         [
//                             '--archive',
//                             format,
//                             snapshotId,
//                             path
//                         ],
//                         {
//                             repository: repository,
//                             logger: job.getLogger(),
//                             outputStream: stream,
//                             ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
//                         }
//                     )

//                     job.once('abort', () => resticCall.abort())

//                     await once(resticCall, 'finish')
//                 },
//                 priority: 'immediate'
//             }),
//             true,
//             true
//         )
//     }

//     public checkRepository(repositoryName: string, trigger:'scheduler' | 'api', priority?: string) {
//         const repository = this.config.repositories[repositoryName]

//         if (!repository) {
//             throw new Error('Unknown repository ' + repositoryName)
//         }

//         return this.jobsManager.addJob(
//             new Job({
//                 logger: this.logger,
//                 trigger: trigger,
//                 operation: 'check',
//                 subjects: {repository: repositoryName},
//                 fn: async (job) => {
//                     await this.unlockRepository(repository, job)

//                     const resticCall = this.restic.call(
//                         'check',
//                         [],
//                         {
//                             repository: repository,
//                             logger: job.getLogger(),
//                             ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
//                         }
//                     )

//                     job.once('abort', () => resticCall.abort())

//                     await once(resticCall, 'finish')
//                 },
//                 priority: priority || (repository.check && repository.check!.priority)
//             })
//         )
//     }

//     public backup(backupName: string, trigger:'scheduler' | 'fswatcher' | 'api', priority?: string) {
//         const backup = this.config.backups[backupName]

//         if (!backup) {
//             throw new Error('Unknown backup ' + backupName)
//         }

//         return this.jobsManager.addJob(
//             new Job({
//                 logger: this.logger,
//                 trigger: trigger,
//                 operation: 'backup',
//                 subjects: {backup: backupName},
//                 fn: async (job) => {
//                     const beforeHook = backup.hooks && backup.hooks.before
//                     let beforeHookOk = true

//                     if (beforeHook) {
//                         try {
//                             await this.handleHook(beforeHook, job)
//                         } catch (e) {
//                             if (beforeHook.onfailure === 'stop') {
//                                 throw e
//                             }
//                             job.getLogger().warning('beforeHook failed', {error: e})
//                             if (beforeHook.onfailure !== 'ignore') {
//                                 beforeHookOk = false
//                             }
//                         }
//                     }

//                     let allRepositoryOk = true

//                     for (const repositoryName of backup.repositories) {
//                         const repository = this.config.repositories[repositoryName]

//                         if (job.getState() === 'aborting') {
//                             return
//                         }

//                         try {
//                             await this.unlockRepository(repository, job)

//                             const resticCall = this.restic.call(
//                                 'backup',
//                                 [
//                                     '--tag',
//                                     this.formatTagValue('backup', backup.name),
//                                     '--tag',
//                                     this.formatTagValue('job', job.getUuid()),
//                                     '--host',
//                                     this.config.hostname,
//                                     ...backup.paths,
//                                     ...backup.excludes ? backup.excludes.map(exclude => '--exclude=' + exclude) : []
//                                 ],
//                                 {
//                                     repository: repository,
//                                     logger: job.getLogger(),
//                                     ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
//                                 }
//                             )

//                             job.once('abort', () => resticCall.abort())

//                             await once(resticCall, 'finish')
//                         } catch (e) {
//                             job.getLogger().warning('repository backup failed', {repository: repositoryName, error: e})
//                             allRepositoryOk = false
//                         }
//                     }

//                     if (!beforeHookOk || !allRepositoryOk) {
//                         throw new Error('Hook or repository backup failed')
//                     }
//                 },
//                 priority: priority || backup.priority
//             })
//         )
//     }

//     public prune(backupName: string, trigger:'scheduler' | 'api', priority?: string) {
//         const backup = this.config.backups[backupName]

//         if (!backup) {
//             throw new Error('Unknown backup ' + backupName)
//         }

//         if (!backup.prune || !backup.prune.retentionPolicy) {
//             throw new Error('No prune policy')
//         }

//         return this.jobsManager.addJob(
//             new Job({
//                 logger: this.logger,
//                 trigger: trigger,
//                 operation: 'prune',
//                 subjects: {backup: backupName},
//                 fn: async (job) => {
//                     let allRepositoryOk = true

//                     for (const repositoryName of backup.repositories) {
//                         const repository = this.config.repositories[repositoryName]

//                         if (job.getState() === 'aborting') {
//                             return
//                         }

//                         try {
//                             await this.unlockRepository(repository, job)

//                             const retentionPolicyMapping: Record<string, string> = {
//                                 'nbOfHourly': 'hourly',
//                                 'nbOfdaily': 'daily',
//                                 'nbOfWeekly': 'weekly',
//                                 'nbOfMonthly': 'monthly',
//                                 'nbOfYearly': 'yearly',
//                                 'minTime': 'within'
//                             }

//                             const retentionPolicyArgs: string[] = _.flatten(_.map(backup.prune!.retentionPolicy, (retentionValue, retentionKey) => {
//                                 if (!retentionPolicyMapping[retentionKey]) {
//                                     throw new Error('Unknown policy rule ' + retentionKey)
//                                 }

//                                 return ['--keep-' + retentionPolicyMapping[retentionKey], retentionValue!.toString()]
//                             })) as string[]

//                             const resticCall = this.restic.call(
//                                 'forget',
//                                 [
//                                     '--prune',
//                                     '--tag',
//                                     this.formatTagValue('backup', backup.name),
//                                     '--host',
//                                     this.config.hostname
//                                 ].concat(retentionPolicyArgs),
//                                 {
//                                     repository: repository,
//                                     logger: job.getLogger(),
//                                     ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
//                                 }
//                             )

//                             job.once('abort', () => resticCall.abort())

//                             await once(resticCall, 'finish')
//                         } catch (e) {
//                             job.getLogger().warning('repository prune failed', {repository: repositoryName, error: e})
//                             allRepositoryOk = false
//                         }
//                     }

//                     if (!allRepositoryOk) {
//                         throw new Error('Repository prune failed')
//                     }
//                 },
//                 priority: priority || backup.prune.priority
//             })
//         )
//     }

//     protected async handleHook(hook: Hook, job: Job) {
//         if (hook.type !== 'http') {
//             throw new Error('Only http implemented')
//         }

//         const request = got({
//             method: hook.method as GotMethod || 'GET',
//             url: hook.url,
//             timeout: hook.timeout ? durationToSeconds(hook.timeout) * 1000 : undefined,
//             retry: hook.retries || 0,
//             hooks: {
//                 beforeRequest: [options  => {job.getLogger().info('Calling hook ' + options.url)}],
//                 afterResponse: [response => { job.getLogger().info('Hook returned code ' + response.statusCode) ; return response }],
//                 beforeError: [error => { job.getLogger().info('Hook returned error ' + error.message) ; return error }]
//             }
//         })

//         job.once('abort', () => request.cancel())

//         await request
//     }

//     protected configureTriggers() {
//         Object.values(this.config.repositories)
//         .filter((repository) => repository.check)
//         .forEach((repository) => {
//             this.fnSchedulers.push(
//                 new FnScheduler(
//                     { operation: 'check', repository: repository.name },
//                     () => this.checkRepository(repository.name, 'scheduler'),
//                     this.logger,
//                     repository.check!.schedules,
//                     true
//                 )
//             )
//         })

//         Object.values(this.config.backups)
//         .forEach((backup) => {
//             if (backup.schedules) {
//                 this.fnSchedulers.push(
//                     new FnScheduler(
//                         { operation: 'backup', backup: backup.name },
//                         () => this.backup(backup.name, 'scheduler'),
//                         this.logger,
//                         backup.schedules,
//                         true
//                     )
//                 )
//             }

//             if (backup.watch) {
//                 this.fsWatchers.push(
//                     new FsWatcher(
//                         () => this.backup(backup.name, 'fswatcher'),
//                         this.logger,
//                         backup.paths,
//                         backup.excludes,
//                         backup.watch.wait && backup.watch.wait.min,
//                         backup.watch.wait && backup.watch.wait.max,
//                     )
//                 )
//             }

//             if (backup.prune && backup.prune.schedules) {
//                 this.fnSchedulers.push(
//                     new FnScheduler(
//                         { operation: 'prune', backup: backup.name },
//                         () => this.prune(backup.name, 'scheduler'),
//                         this.logger,
//                         backup.prune.schedules,
//                         true
//                     )
//                 )
//             }

//         })

//     }

//     protected initRepository(repositoryName: string) {
//         const repository = this.config.repositories[repositoryName]

//         this.jobsManager.addJob(
//             new Job({
//                 logger: this.logger,
//                 trigger: null,
//                 operation: 'init',
//                 subjects: {repository: repositoryName},
//                 fn: async (job) => {
//                     const resticCall = this.restic.call(
//                         'init',
//                         [],
//                         {
//                             repository: repository,
//                             logger: job.getLogger(),
//                             ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
//                         }
//                     )

//                     job.once('abort', () => resticCall.abort())

//                     try {
//                         await once(resticCall, 'finish')
//                     } catch (e) {
//                         job.getLogger().info('Failed finish, ignoring because of probably already initialized')
//                     }
//                 },
//                 priority: 'next'
//             })
//         )
//     }




//     // def get_path_history(self, repository_name, backup_name, path, priority='immediate'):
//     //     #sudo RESTIC_REPOSITORY=test/repositories/app2 RESTIC_PASSWORD= restic find --long '/sources/.truc/.machin/super.txt' --json --tag backup-xxx --host host-xxx
//     //     pass




//     // def restore_snapshot(self, repository_name, snapshot, target_path=None, priority='normal', get_result=False):
//     //     if not target_path:
//     //         target_path = '/'

//     //     repository = self._config['repositories'][repository_name]

//     //     self._logger.info('restore_snapshot requested', extra={
//     //         'component': 'daemon',
//     //         'action': 'restore_snapshot',
//     //         'repository': repository['name'],
//     //         'snapshot': snapshot,
//     //         'status': 'queuing'
//     //     })

//     //     def do_restore_snapshot():
//     //         self._logger.info('Starting restore', extra={
//     //             'component': 'daemon',
//     //             'action': 'restore_snapshot',
//     //             'repository': repository_name,
//     //             'snapshot': snapshot,
//     //             'status': 'starting'
//     //         })
//     //         try:
//     //             args = [snapshot]
//     //             args = args + ['--target', target_path]
//     //             args = args + self._get_restic_global_opts()
//     //             self._unlock_repository(repository)
//     //             call_restic(cmd='restore', args=args, env=self._get_restic_repository_envs(repository), logger=self._logger)
//     //             self._logger.info('Restore ended', extra={
//     //                 'component': 'daemon',
//     //                 'action': 'restore_snapshot',
//     //                 'repository': repository_name,
//     //                 'snapshot': snapshot,
//     //                 'status': 'success'
//     //             })
//     //         except Exception as e:
//     //             self._logger.exception('Restore failed', extra={
//     //                 'component': 'daemon',
//     //                 'action': 'restore_snapshot',
//     //                 'repository': repository_name,
//     //                 'snapshot': snapshot,
//     //                 'status': 'failure'
//     //             })

//     //     self._task_manager.add_task(
//     //         task=Task(fn=do_restore_snapshot, priority=priority, id="restore_snap_%s_%s" % (repository_name, snapshot)),
//     //         ignore_if_duplicate=True,
//     //         get_result=False
//     //     )
// }




export interface ResticOperatorConfig {
    device: string
    uploadLimit?: string
    downloadLimit?: string
}

interface ResticSnapshot {
    time: string,
    hostname: string,
    tags: string[]
    id: string
}

// Link Domain with Restic, unitary
export  class ResticOperator {
    protected config: ResticOperatorConfig

    constructor(config: ResticOperatorConfig) {
        this.config = config
    }

    public async initRepository(
        {repository, logger, abortSignal}:
        {repository: Repository, logger: Logger, abortSignal: AbortSignal}
    ) {
        await this.runRestic({
            cmd: 'init',
            repository,
            logger,
            abortSignal
        })
    }

    public async listSnapshots(
        {repository, logger, device, backup, abortSignal}:
        {repository: Repository, logger: Logger, device?: string, backup?: Backup, abortSignal?: AbortSignal}
    ): Promise<Snapshot[]> {
        await this.unlockRepository({repository, logger, abortSignal})

        const resticSnapshots: ResticSnapshot[] = await this.runRestic({
            cmd: 'snapshots',
            outputType: 'json',
            repository,
            logger,
            device,
            abortSignal,
            backup
        })

        return resticSnapshots.map(resticSnapshot => ({
            id: resticSnapshot.id,
            date: new Date(resticSnapshot.time),
            device: resticSnapshot.hostname,
            backup: this.extractValueFromTags(resticSnapshot.tags, 'backup'),
            job: this.extractValueFromTags(resticSnapshot.tags, 'job'),
            repository: repository.name
        }))
    }

    public async forgetAndPrune(
        {repository, logger, abortSignal, backup, device}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal, backup: Backup, device: string}
    ) {
        if (!backup.prune) {
            throw new Error('No prune policy')
        }

        await this.unlockRepository({repository, logger, abortSignal})

        const retentionPolicyMapping: Record<string, string> = {
            'nbOfHourly': 'hourly',
            'nbOfdaily': 'daily',
            'nbOfWeekly': 'weekly',
            'nbOfMonthly': 'monthly',
            'nbOfYearly': 'yearly',
            'minTime': 'within'
        }

        const retentionPolicyArgs: string[] = flatten(map(omitBy(backup.prune.retentionPolicy, isNil), (retentionValue, retentionKey) => {
            if (!retentionPolicyMapping[retentionKey]) {
                throw new Error('Unknown policy rule ' + retentionKey)
            }

            if (retentionKey === 'minTime') {
                retentionValue = durationToSeconds(retentionValue as string)
            }

            return ['--keep-' + retentionPolicyMapping[retentionKey], retentionValue.toString()]
        })) as string[]

        await this.runRestic({
            cmd: 'forget',
            args: ['--prune', ...retentionPolicyArgs],
            repository,
            logger,
            abortSignal,
            device,
            backup
        })
    }

    public async backup(
        {repository, logger, abortSignal, backup, device, job}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal, backup: Backup, device: string, job: string}
    ) {
        await this.unlockRepository({repository, logger, abortSignal})

        await this.runRestic({
            cmd: 'backup',
            args: [
                ...backup.paths,
                ...backup.excludes ? backup.excludes.map(exclude => '--exclude=' + exclude) : []
            ],
            repository,
            logger,
            abortSignal,
            device,
            backup,
            job
        })
    }

    public async downloadSnapshot(
        {repository, logger, abortSignal, format, snapshotId, path, stream}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal, format: 'zip' | 'tar', snapshotId: string, path: string, stream: NodeJS.WritableStream}
    ) {
        await this.unlockRepository({repository, logger, abortSignal})

        await this.runRestic({
            logger,
            repository,
            abortSignal,
            cmd: 'dump',
            args: ['--archive', format, snapshotId, path],
            outputStream: stream
        })
    }

    public async getSnapshot(
        {repository, logger, abortSignal, snapshotId}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal, snapshotId: string}
    ): Promise<Snapshot> {
        await this.unlockRepository({repository, logger, abortSignal})

        const [infos, ...objects]: [ResticSnapshot, object[]] = await this.runRestic({
            repository,
            logger,
            abortSignal,
            cmd: 'ls',
            args: ['--long', snapshotId],
            outputType: 'multilineJson'
        })

        return {
            date: new Date(infos.time),
            repository: repository.name,
            backup: this.extractValueFromTags(infos.tags, 'backup'),
            job: this.extractValueFromTags(infos.tags, 'job'),
            id: snapshotId,
            device: infos.hostname,
            objects: objects.map((o: object) => ({permissions: 'unknown', ...o}))
        }
    }

    public async checkRepository(
        {repository, logger, abortSignal}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal}
    ) {
        await this.unlockRepository({repository, logger, abortSignal})

        await this.runRestic({
            cmd: 'check',
            repository,
            logger,
            abortSignal
        })
    }

    protected async unlockRepository(
        {repository, logger, abortSignal}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal}
    ) {
        await this.runRestic({
            cmd: 'unlock',
            repository,
            logger,
            abortSignal
        })
    }

    protected async runRestic<T>(
        {cmd, args, repository, logger, device, abortSignal, outputType, backup, job, outputStream}:
        {cmd: string, args?: string[], repository: Repository, logger: Logger, device?: string, outputStream?: NodeJS.WritableStream,
         abortSignal?: AbortSignal, outputType?: ProcessConfig['outputType'], backup?: Backup, job?: string}
    ): Promise<T> {
        const cmdArgs: string[] = ['--cleanup-cache', ...args || []]

        if (outputType === 'json' || outputType === 'multilineJson') {
            cmdArgs.push('--json')
        }

        if (device) {
            cmdArgs.push('--host', device)
        }

        if (backup) {
            cmdArgs.push('--tag', this.formatTagValue('backup', backup.name))
        }

        if (job) {
            cmdArgs.push('--tag', this.formatTagValue('job', job))
        }

        const uploadLimit = this.config.uploadLimit
        const downloadLimit = this.config.downloadLimit

        if (uploadLimit) {
            cmdArgs.push('--limit-upload', sizeToKiB(uploadLimit).toString())
        }

        if (downloadLimit) {
            cmdArgs.push('--limit-download', sizeToKiB(downloadLimit).toString())
        }

        const env = {
            RESTIC_REPOSITORY: repository.location,
            RESTIC_PASSWORD: repository.password,
            ...this.getProviderEnvs(repository)
        }

        return await runProcess({
            env: {...env, RESTIC_CACHE_DIR: '/var/cache/restic'},
            logger,
            cmd,
            args: cmdArgs,
            abortSignal,
            outputType,
            killSignal: 'SIGINT',
            outputStream
        }, true)
    }

    protected getProviderEnvs(repository: Repository): Record<string, string> {
        if (!repository.provider) {
            return {}
        }

        return reduce(repository.provider.params, (providerEnvs: Record<string, string>, value: string, key: string) => {
            providerEnvs[repository.provider!.name.toUpperCase() + '_' + key.toUpperCase()] = value.toString()

            return providerEnvs
        }, {})
    }

    protected extractValueFromTags(tags: string[], key: string) {
        const tag = tags.find(tag => tag.substr(0, key.length + 1) === key + '-')

        if (!tag) {
            throw new Error('Missing key ' + key)
        }

        return tag.substr(key.length + 1)
    }

    protected formatTagValue(key: string, value: string) {
        return key + '-' + value
    }
}
