import { Logger } from './logger'
import { Config, Hook } from './config'
import FnScheduler from './fn-scheduler'
import JobsManager, { Job } from './jobs-manager'
import FsWatcher from './fs-watcher'
import Restic from './restic'
import { once } from 'events'
import _ from 'lodash'
import { durationToSeconds } from './utils'
import got, { Method as GotMethod } from 'got'
import { reduce as asyncReduce } from 'bluebird'

export default class Daemon {
    protected config: Config
    protected logger: Logger
    protected fnSchedulers: FnScheduler[] = []
    protected fsWatchers: FsWatcher[] = []
    protected jobsManager: JobsManager
    protected started = false
    protected restic: Restic

    constructor(config: Config, logger: Logger) {
        this.config = config
        this.logger = logger
        this.jobsManager = new JobsManager(logger)
        this.restic = new Restic({
            uploadLimit: this.config.uploadLimit,
            downloadLimit: this.config.downloadLimit,
            logger: this.logger
        })
        this.configureTriggers()
    }

    public start() {
        if (this.started) {
            return
        }
        this.started = true
        this.jobsManager.start()

        Object.keys(this.config.repositories).forEach((repositoryName) => {
            this.initRepository(repositoryName)
        })

        this.fnSchedulers.forEach(fnScheduler => fnScheduler.start())
        this.fsWatchers.forEach(fsWatcher => fsWatcher.start())
    }

    public stop() {
        if (!this.started) {
            return
        }
        this.started = false
        this.fnSchedulers.forEach(fnScheduler => fnScheduler.stop())
        this.fsWatchers.forEach(fsWatcher => fsWatcher.stop())
        this.jobsManager.stop()
    }

    public getConfigSummary() {
        return {
            hostname: this.config.hostname,
            repositories: _.mapValues(this.config.repositories, () => ({})),
            backups: _.mapValues(this.config.backups, (backup) => ({
                repositories: backup['repositories']
            }))
        }
    }

    public async getSummary() {
        const jobs: Record<string, any>= this.jobsManager.getJobs()

        function findBackupJob(jobs: Job[], backupName: string) {
            return jobs.find((job: Job) => job.getOperation() === 'backup' && job.getSubjects().backup === backupName) || null
        }

        function findBackupScheduler(schedulers: FnScheduler[], backupName: string) {
            return schedulers.find(fnScheduler => fnScheduler.getId().operation === 'backup' && fnScheduler.getId().backup === backupName) || null
        }

        function findPruneJob(jobs: Job[], backupName: string) {
            return jobs.find((job: Job) => job.getOperation() === 'prune' && job.getSubjects().backup === backupName) || null
        }

        function findPruneScheduler(schedulers: FnScheduler[], backupName: string) {
            return schedulers.find(fnScheduler => fnScheduler.getId().operation === 'prune' && fnScheduler.getId().backup === backupName) || null
        }

        function findCheckJob(jobs: Job[], repositoryName: string) {
            return jobs.find((job: Job) => job.getOperation() === 'check' && job.getSubjects().repository === repositoryName) || null
        }

        function findCheckScheduler(schedulers: FnScheduler[], repositoryName: string) {
            return schedulers.find(fnScheduler => fnScheduler.getId().operation === 'check' && fnScheduler.getId().repository === repositoryName) || null
        }

        return {
            started: this.started,
            backups: await asyncReduce(Object.keys(this.config.backups), async (backupsStatus, backupName) => {
                const lastJob = findBackupJob(jobs.archived, backupName)
                const running = findBackupJob(jobs.running, backupName)
                const queuedJob = findBackupJob(jobs.queue, backupName)
                const scheduler = findBackupScheduler(this.fnSchedulers, backupName)

                return {...backupsStatus, ...{
                    [backupName]: {
                        lastArchivedJob: lastJob && await lastJob.toJson(),
                        runningJob: running && await running.toJson(),
                        queueJob: queuedJob && await queuedJob.toJson(),
                        nextSchedule: scheduler && scheduler.getNextScheduledDate()
                    }
                }}
            }, {}),
            checks: await asyncReduce(Object.keys(this.config.repositories), async (checksStatus, repositoryName) => {
                const lastJob = findCheckJob(jobs.archived, repositoryName)
                const running = findCheckJob(jobs.running, repositoryName)
                const queuedJob = findCheckJob(jobs.queue, repositoryName)
                const scheduler = findCheckScheduler(this.fnSchedulers, repositoryName)

                return {...checksStatus, ...{
                    [repositoryName]: {
                        lastArchivedJob: lastJob && await lastJob.toJson(),
                        runningJob: running && await running.toJson(),
                        queueJob: queuedJob && await queuedJob.toJson(),
                        nextSchedule: scheduler && scheduler.getNextScheduledDate()
                    }
                }}
            }, {}),
            prunes: await asyncReduce(Object.keys(this.config.backups), async (prunesStatus, backupName) => {
                const lastJob = findPruneJob(jobs.archived, backupName)
                const running = findPruneJob(jobs.running, backupName)
                const queuedJob = findPruneJob(jobs.queue, backupName)
                const scheduler = findPruneScheduler(this.fnSchedulers, backupName)

                return {...prunesStatus, ...{
                    [backupName]: {
                        lastArchivedJob: lastJob && await lastJob.toJson(),
                        runningJob: running && await running.toJson(),
                        queueJob: queuedJob && await queuedJob.toJson(),
                        nextSchedule: scheduler && scheduler.getNextScheduledDate()
                    }
                }}
            }, {})
        }
    }

    public async getJobs() {

        const allJobs: Record<string, any>= this.jobsManager.getJobs()

        for (const type in allJobs) {
            allJobs[type] = await Promise.all(allJobs[type].map((job: Job) => job.toJson()))
        }

        return allJobs
    }

    public getJob(jobUuid: string): Job {
        return this.jobsManager.getJob(jobUuid)
    }

    public listSnapshots(criterias: {backupName?: string, repositoryName?: string}, trigger: 'api') {
        if (criterias.backupName && !this.config.backups[criterias.backupName]) {
            throw new Error('Unknown backup ' + criterias.backupName)
        }

        if (criterias.repositoryName && !this.config.repositories[criterias.repositoryName]) {
            throw new Error('Unknown repository ' + criterias.repositoryName)
        }

        return this.jobsManager.addJob(
            new Job({
                logger: this.logger,
                trigger: trigger,
                operation: 'listSnapshots',
                subjects: {
                    ...criterias.backupName && {backup: criterias.backupName},
                    ...criterias.repositoryName && {repository: criterias.repositoryName}
                },
                fn: async (job) => {
                    const args = ['--host', this.config.hostname]

                    if (criterias.backupName) {
                        args.push('--tag', 'backup-' + criterias.backupName)
                    }

                    let searchRepositories: string[]

                    if (criterias.repositoryName) {
                        searchRepositories = [criterias.repositoryName]
                    } else if (criterias.backupName) {
                        searchRepositories = this.config.backups[criterias.backupName].repositories
                    } else {
                        searchRepositories = Object.keys(this.config.repositories)
                    }

                    let snapshots: Record<string, any>[] = []

                    for (const repositoryName of searchRepositories) {
                        const repository = this.config.repositories[repositoryName]

                        await this.unlockRepository(repository, job)

                        const resticCall = this.restic.call(
                            'snapshots',
                            args,
                            {
                                repository: repository,
                                logger: job.getLogger(),
                                ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
                            }
                        )

                        job.once('abort', () => resticCall.abort())

                        const [resticSnapshots]: Array<Record<string, any>[]> = await once(resticCall, 'finish')
                        snapshots = snapshots.concat(
                            resticSnapshots.map(resticSnapshot => ({
                                date: resticSnapshot['time'],
                                //hostname: resticSnapshot['hostname'],
                                backup: this.extractValueFromTags(resticSnapshot.tags, 'backup'),
                                job: this.extractValueFromTags(resticSnapshot.tags, 'job'),
                                repository: repositoryName,
                                id: resticSnapshot['id']
                            }))
                        )
                    }

                    return _.sortBy(snapshots, 'date').reverse()
                },
                priority: 'immediate'
            }),
            true,
            true
        )
    }

    public getSnapshot(repositoryName: string, snapshotId: string, trigger: 'api') {
        const repository = this.config.repositories[repositoryName]

        if (!repository) {
            throw new Error('Unknown repository ' + repositoryName)
        }

        return this.jobsManager.addJob(
            new Job({
                logger: this.logger,
                trigger: trigger,
                operation: 'getSnapshot',
                subjects: {repository: repositoryName, snapshot: snapshotId},
                fn: async (job) => {
                    await this.unlockRepository(repository, job)

                    const resticCall = this.restic.call(
                        'ls',
                        [
                            '--long',
                            snapshotId
                        ],
                        {
                            repository: repository,
                            logger: job.getLogger(),
                            ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
                        }
                    )

                    job.once('abort', () => resticCall.abort())

                    const [[infos, ...objects]] = await once(resticCall, 'finish')

                    if (infos.hostname !== this.config.hostname) {
                        throw new Error('Unknown snapshot ' + snapshotId)
                    }

                    return {
                        repository: repositoryName,
                        backup: this.extractValueFromTags(infos.tags, 'backup'),
                        job: this.extractValueFromTags(infos.tags, 'job'),
                        snapshot: snapshotId,
                        objects: objects.map((o: object) => ({permissions: 'unknown', ...o}))
                    }
                },
                priority: 'immediate'
            }),
            true,
            true
        )
    }

    public downloadSnapshot(
        repositoryName: string,
        snapshotId: string,
        stream: NodeJS.WritableStream,
        path: string,
        format: 'tar' | 'zip',
        trigger: 'api'
    ) {
        const repository = this.config.repositories[repositoryName]

        if (!repository) {
            throw new Error('Unknown repository ' + repositoryName)
        }

        return this.jobsManager.addJob(
            new Job({
                logger: this.logger,
                trigger: trigger,
                operation: 'downloadSnapshot',
                subjects: {repository: repositoryName, snapshot: snapshotId, path},
                fn: async (job) => {
                    await this.unlockRepository(repository, job)

                    const resticCall = this.restic.call(
                        'dump',
                        [
                            '--archive',
                            format,
                            snapshotId,
                            path
                        ],
                        {
                            repository: repository,
                            logger: job.getLogger(),
                            outputStream: stream,
                            ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
                        }
                    )

                    job.once('abort', () => resticCall.abort())

                    await once(resticCall, 'finish')
                },
                priority: 'immediate'
            }),
            true,
            true
        )
    }

    public checkRepository(repositoryName: string, trigger:'scheduler' | 'api', priority?: string) {
        const repository = this.config.repositories[repositoryName]

        if (!repository) {
            throw new Error('Unknown repository ' + repositoryName)
        }

        return this.jobsManager.addJob(
            new Job({
                logger: this.logger,
                trigger: trigger,
                operation: 'check',
                subjects: {repository: repositoryName},
                fn: async (job) => {
                    await this.unlockRepository(repository, job)

                    const resticCall = this.restic.call(
                        'check',
                        [],
                        {
                            repository: repository,
                            logger: job.getLogger(),
                            ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
                        }
                    )

                    job.once('abort', () => resticCall.abort())

                    await once(resticCall, 'finish')
                },
                priority: priority || (repository.check && repository.check!.priority)
            })
        )
    }

    public backup(backupName: string, trigger:'scheduler' | 'fswatcher' | 'api', priority?: string) {
        const backup = this.config.backups[backupName]

        if (!backup) {
            throw new Error('Unknown backup ' + backupName)
        }

        return this.jobsManager.addJob(
            new Job({
                logger: this.logger,
                trigger: trigger,
                operation: 'backup',
                subjects: {backup: backupName},
                fn: async (job) => {
                    const beforeHook = backup.hooks && backup.hooks.before
                    let beforeHookOk = true

                    if (beforeHook) {
                        try {
                            await this.handleHook(beforeHook, job)
                        } catch (e) {
                            if (beforeHook.onfailure === 'stop') {
                                throw e
                            }
                            job.getLogger().warning('beforeHook failed', {error: e})
                            if (beforeHook.onfailure !== 'ignore') {
                                beforeHookOk = false
                            }
                        }
                    }

                    let allRepositoryOk = true

                    for (const repositoryName of backup.repositories) {
                        const repository = this.config.repositories[repositoryName]

                        if (job.getState() === 'aborting') {
                            return
                        }

                        try {
                            await this.unlockRepository(repository, job)

                            const resticCall = this.restic.call(
                                'backup',
                                [
                                    '--tag',
                                    this.formatTagValue('backup', backup.name),
                                    '--tag',
                                    this.formatTagValue('job', job.getUuid()),
                                    '--host',
                                    this.config.hostname,
                                    ...backup.paths,
                                    ...backup.excludes ? backup.excludes.map(exclude => '--exclude=' + exclude) : []
                                ],
                                {
                                    repository: repository,
                                    logger: job.getLogger(),
                                    ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
                                }
                            )

                            job.once('abort', () => resticCall.abort())

                            await once(resticCall, 'finish')
                        } catch (e) {
                            job.getLogger().warning('repository backup failed', {repository: repositoryName, error: e})
                            allRepositoryOk = false
                        }
                    }

                    if (!beforeHookOk || !allRepositoryOk) {
                        throw new Error('Hook or repository backup failed')
                    }
                },
                priority: priority || backup.priority
            })
        )
    }

    public prune(backupName: string, trigger:'scheduler' | 'api', priority?: string) {
        const backup = this.config.backups[backupName]

        if (!backup) {
            throw new Error('Unknown backup ' + backupName)
        }

        if (!backup.prune || !backup.prune.retentionPolicy) {
            throw new Error('No prune policy')
        }

        return this.jobsManager.addJob(
            new Job({
                logger: this.logger,
                trigger: trigger,
                operation: 'prune',
                subjects: {backup: backupName},
                fn: async (job) => {
                    let allRepositoryOk = true

                    for (const repositoryName of backup.repositories) {
                        const repository = this.config.repositories[repositoryName]

                        if (job.getState() === 'aborting') {
                            return
                        }

                        try {
                            await this.unlockRepository(repository, job)

                            const retentionPolicyMapping: Record<string, string> = {
                                'nbOfHourly': 'hourly',
                                'nbOfdaily': 'daily',
                                'nbOfWeekly': 'weekly',
                                'nbOfMonthly': 'monthly',
                                'nbOfYearly': 'yearly',
                                'minTime': 'within'
                            }

                            const retentionPolicyArgs: string[] = _.flatten(_.map(backup.prune!.retentionPolicy, (retentionValue, retentionKey) => {
                                if (!retentionPolicyMapping[retentionKey]) {
                                    throw new Error('Unknown policy rule ' + retentionKey)
                                }

                                return ['--keep-' + retentionPolicyMapping[retentionKey], retentionValue!.toString()]
                            })) as string[]

                            const resticCall = this.restic.call(
                                'forget',
                                [
                                    '--prune',
                                    '--tag',
                                    this.formatTagValue('backup', backup.name),
                                    '--host',
                                    this.config.hostname
                                ].concat(retentionPolicyArgs),
                                {
                                    repository: repository,
                                    logger: job.getLogger(),
                                    ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
                                }
                            )

                            job.once('abort', () => resticCall.abort())

                            await once(resticCall, 'finish')
                        } catch (e) {
                            job.getLogger().warning('repository prune failed', {repository: repositoryName, error: e})
                            allRepositoryOk = false
                        }
                    }

                    if (!allRepositoryOk) {
                        throw new Error('Repository prune failed')
                    }
                },
                priority: priority || backup.prune.priority
            })
        )
    }

    protected async handleHook(hook: Hook, job: Job) {
        if (hook.type !== 'http') {
            throw new Error('Only http implemented')
        }

        const request = got({
            method: hook.method as GotMethod || 'GET',
            url: hook.url,
            timeout: hook.timeout ? durationToSeconds(hook.timeout) * 1000 : undefined,
            retry: hook.retries || 0,
            hooks: {
                beforeRequest: [options  => {job.getLogger().info('Calling hook ' + options.url)}],
                afterResponse: [response => { job.getLogger().info('Hook returned code ' + response.statusCode) ; return response }],
                beforeError: [error => { job.getLogger().info('Hook returned error ' + error.message) ; return error }]
            }
        })

        job.once('abort', () => request.cancel())

        await request
    }

    protected configureTriggers() {
        Object.values(this.config.repositories)
        .filter((repository) => repository.check)
        .forEach((repository) => {
            this.fnSchedulers.push(
                new FnScheduler(
                    { operation: 'check', repository: repository.name },
                    () => this.checkRepository(repository.name, 'scheduler'),
                    this.logger,
                    repository.check!.schedules,
                    true
                )
            )
        })

        Object.values(this.config.backups)
        .forEach((backup) => {
            if (backup.schedules) {
                this.fnSchedulers.push(
                    new FnScheduler(
                        { operation: 'backup', backup: backup.name },
                        () => this.backup(backup.name, 'scheduler'),
                        this.logger,
                        backup.schedules,
                        true
                    )
                )
            }

            if (backup.watch) {
                this.fsWatchers.push(
                    new FsWatcher(
                        () => this.backup(backup.name, 'fswatcher'),
                        this.logger,
                        backup.paths,
                        backup.excludes,
                        backup.watch.wait && backup.watch.wait.min,
                        backup.watch.wait && backup.watch.wait.max,
                    )
                )
            }

            if (backup.prune && backup.prune.schedules) {
                this.fnSchedulers.push(
                    new FnScheduler(
                        { operation: 'prune', backup: backup.name },
                        () => this.prune(backup.name, 'scheduler'),
                        this.logger,
                        backup.prune.schedules,
                        true
                    )
                )
            }

        })

    }

    protected initRepository(repositoryName: string) {
        const repository = this.config.repositories[repositoryName]

        this.jobsManager.addJob(
            new Job({
                logger: this.logger,
                trigger: null,
                operation: 'init',
                subjects: {repository: repositoryName},
                fn: async (job) => {
                    const resticCall = this.restic.call(
                        'init',
                        [],
                        {
                            repository: repository,
                            logger: job.getLogger(),
                            ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
                        }
                    )

                    job.once('abort', () => resticCall.abort())

                    try {
                        await once(resticCall, 'finish')
                    } catch (e) {
                        job.getLogger().info('Failed finish, ignoring because of probably already initialized')
                    }
                },
                priority: 'next'
            })
        )
    }

    protected async unlockRepository(repository: Config['repositories'][0], job: Job) {
        const resticCall = this.restic.call(
            'unlock',
            [],
            {
                repository: repository,
                logger: job.getLogger(),
                ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
            }
        )

        job.once('abort', () => resticCall.abort())

        await once(resticCall, 'finish')
    }


    protected extractValueFromTags(tags: string[], key: string) {
        const tag = tags.find(tag => tag.substr(0, key.length + 1) === key + '-')

        if (!tag) {
            return
        }

        return tag.substr(key.length + 1)
    }

    protected formatTagValue(key: string, value: string) {
        return key + '-' + value
    }

    // def get_path_history(self, repository_name, backup_name, path, priority='immediate'):
    //     #sudo RESTIC_REPOSITORY=test/repositories/app2 RESTIC_PASSWORD= restic find --long '/sources/.truc/.machin/super.txt' --json --tag backup-xxx --host host-xxx
    //     pass




    // def restore_snapshot(self, repository_name, snapshot, target_path=None, priority='normal', get_result=False):
    //     if not target_path:
    //         target_path = '/'

    //     repository = self._config['repositories'][repository_name]

    //     self._logger.info('restore_snapshot requested', extra={
    //         'component': 'daemon',
    //         'action': 'restore_snapshot',
    //         'repository': repository['name'],
    //         'snapshot': snapshot,
    //         'status': 'queuing'
    //     })

    //     def do_restore_snapshot():
    //         self._logger.info('Starting restore', extra={
    //             'component': 'daemon',
    //             'action': 'restore_snapshot',
    //             'repository': repository_name,
    //             'snapshot': snapshot,
    //             'status': 'starting'
    //         })
    //         try:
    //             args = [snapshot]
    //             args = args + ['--target', target_path]
    //             args = args + self._get_restic_global_opts()
    //             self._unlock_repository(repository)
    //             call_restic(cmd='restore', args=args, env=self._get_restic_repository_envs(repository), logger=self._logger)
    //             self._logger.info('Restore ended', extra={
    //                 'component': 'daemon',
    //                 'action': 'restore_snapshot',
    //                 'repository': repository_name,
    //                 'snapshot': snapshot,
    //                 'status': 'success'
    //             })
    //         except Exception as e:
    //             self._logger.exception('Restore failed', extra={
    //                 'component': 'daemon',
    //                 'action': 'restore_snapshot',
    //                 'repository': repository_name,
    //                 'snapshot': snapshot,
    //                 'status': 'failure'
    //             })

    //     self._task_manager.add_task(
    //         task=Task(fn=do_restore_snapshot, priority=priority, id="restore_snap_%s_%s" % (repository_name, snapshot)),
    //         ignore_if_duplicate=True,
    //         get_result=False
    //     )
}
