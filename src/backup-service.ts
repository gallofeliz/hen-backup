import { Schedule } from 'js-libs/fn-scheduler'
import { JobPriority } from './jobs-service'
import { Duration } from 'js-libs/utils'
import { ResticForgetPolicy} from './restic-client'
import { Hook } from './hook-handler'

export interface Backup {
    name: string
    repositories: string[]
    paths: string[]
    excludes?: string[]
    schedules?: Schedule[]
    priority?: JobPriority
    watch?: {
        wait?: {
            min: Duration
            max: Duration
        }
    }
    prune?: {
        schedules?: Schedule[]
        priority?: JobPriority
        retentionPolicy: ResticForgetPolicy
    },
    hooks?: {
        before?: Hook
    }
}



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
