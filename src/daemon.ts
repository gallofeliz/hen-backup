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

export default class Daemon {
    protected config: Config
    protected logger: Logger
    protected fnSchedulers: FnScheduler[] = []
    protected jobsManager: JobsManager
    protected started = false
    protected fsWatchers: FsWatcher[] = []
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

    public getJobsSummary() {
        return _.mapValues(this.jobsManager.getSummary(), jobs => jobs.map(job => ({
            uuid: job.getUuid(),
            createdAt: job.getCreatedAt(),
            state: job.getState(),
            priority: job.getPriority(),
            trigger: job.getTrigger(),
            operation: job.getOperation(),
            subjects: job.getSubjects()
        })))
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
                subjects: criterias,
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
                                logger: job.getLogger()
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

                    return _.sortBy(snapshots, 'date')

                },
                priority: 'immediate'
            }),
            true,
            true
        )
    }

    public getSnapshot(repositoryName: string, snapshotId: string) {
        const repository = this.config.repositories[repositoryName]

        if (!repository) {
            throw new Error('Unknown repository ' + repositoryName)
        }

    // def explain_snapshot(self, repository_name, snapshot_id, priority='immediate'):
    //     repository = self._config['repositories'][repository_name]

    //     response = call_restic(
    //                     cmd='ls',
    //                     args=['--long', snapshot_id],
    //                     env=self._get_restic_repository_envs(repository),
    //                     logger=self._logger,
    //                     json=True
    //                 )['stdout']

    //     objects = response[1:]
    //     tags = response[0]['tags']
    //     backup_name = None

    //     for tag in tags:
    //         if tag[0:7] == 'backup-':
    //             backup_name = tag[7:]


    //     for obj in objects:
    //         obj['permissions'] = 'unknown'

    //     return {
    //         'repository_name': repository_name,
    //         'backup_name': backup_name,
    //         'snapshot_id': snapshot_id,
    //         'objects': objects
    //     }
    }

    public async checkRepository(repositoryName: string, trigger:'scheduler' | 'api', priority?: string) {
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
                            logger: job.getLogger()
                        }
                    )

                    job.once('abort', () => resticCall.abort())

                    await once(resticCall, 'finish')
                },
                priority: priority || repository.check!.priority
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
                                    ...backup.uploadLimit !== undefined && { uploadLimit: backup.uploadLimit },
                                    ...backup.downloadLimit !== undefined && { downloadLimit: backup.downloadLimit },
                                }
                            )

                            job.once('abort', () => resticCall.abort())

                            await once(resticCall, 'finish')
                        } catch (e) {
                            allRepositoryOk = false
                        }
                    }

                    if (!allRepositoryOk || !allRepositoryOk) {
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

        throw new Error('Not implemented');
    // def prune(self, backup_name, priority=None, get_result=False):
    //     backup = self._config['backups'][backup_name]
    //     prune = backup['prune']

    //     if not priority:
    //         priority = prune.get('priority', 'normal')

    //     self._logger.info('prune requested', extra={
    //         'component': 'daemon',
    //         'action': 'prune',
    //         'backup': backup['name'],
    //         'status': 'queuing'
    //     })

    //     def do_prune():
    //         self._logger.info('Starting prune', extra={
    //             'component': 'daemon',
    //             'action': 'prune',
    //             'backup': backup['name'],
    //             'status': 'starting'
    //         })

    //         all_repo_ok = True
    //         for repository_name in backup['repositories']:
    //             repository = self._config['repositories'][repository_name]
    //             self._logger.info('Starting prune on repository', extra={
    //                 'component': 'daemon',
    //                 'action': 'prune',
    //                 'subaction': 'prune_repository',
    //                 'backup': backup['name'],
    //                 'repository': repository['name'],
    //                 'status': 'starting'
    //             })
    //             try:
    //                 options = ['--prune', '--tag', quote('backup-' + backup['name']), '--host', self._config['hostname']] + self._get_restic_global_opts(backup)

    //                 for retention_policy_key in prune['retentionPolicy']:
    //                     retention_policy_value = prune['retentionPolicy'][retention_policy_key]

    //                     mapping = {
    //                         'nbOfHourly': 'hourly',
    //                         'nbOfdaily': 'daily',
    //                         'nbOfWeekly': 'weekly',
    //                         'nbOfMonthly': 'monthly',
    //                         'nbOfYearly': 'yearly',
    //                         'minTime': 'within'
    //                     }

    //                     if not retention_policy_key in mapping:
    //                         raise Exception('Unknown policy rule ' + retention_policy_key)

    //                     options.append('--keep-' + mapping[retention_policy_key])
    //                     options.append(str(retention_policy_value))

    //                 self._unlock_repository(repository)
    //                 call_restic(cmd='forget', args=options, env=self._get_restic_repository_envs(repository), logger=self._logger)
    //                 self._logger.info('Prune on repository ended :)', extra={
    //                     'component': 'daemon',
    //                     'action': 'prune',
    //                     'subaction': 'prune_repository',
    //                     'backup': backup['name'],
    //                     'repository': repository['name'],
    //                     'status': 'success'
    //                 })
    //             except Exception as e:
    //                 self._logger.exception('Prune on repository failed :(', extra={
    //                     'component': 'daemon',
    //                     'subaction': 'prune_repository',
    //                     'action': 'prune',
    //                     'backup': backup['name'],
    //                     'repository': repository['name'],
    //                     'status': 'failure'
    //                 })
    //                 all_repo_ok = False

    //         if all_repo_ok:
    //             self._logger.info('Prune ended :)', extra={
    //                 'component': 'daemon',
    //                 'action': 'prune',
    //                 'backup': backup['name'],
    //                 'status': 'success'
    //             })
    //         else:
    //             self._logger.error('Prune failed (prune in repository failed) :(', extra={
    //                 'component': 'daemon',
    //                 'action': 'prune',
    //                 'backup': backup['name'],
    //                 'status': 'failure'
    //             })

    //     self._task_manager.add_task(
    //         task=Task(fn=do_prune, priority=priority, id="prune_%s" % backup_name),
    //         ignore_if_duplicate=True,
    //         get_result=get_result
    //     )


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
                    () => this.checkRepository(repository.name, 'scheduler'),
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
                        () => this.backup(backup.name, 'scheduler'),
                        backup.schedules,
                        true
                    )
                )
            }

            if (backup.watch) {
                this.fsWatchers.push(
                    new FsWatcher(
                        () => this.backup(backup.name, 'fswatcher'),
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
                        () => this.prune(backup.name, 'scheduler'),
                        backup.prune.schedules,
                        false
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
                            logger: job.getLogger()
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
                logger: job.getLogger()
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

    // def download_snapshot(self):
    //     # TODO test with node

    //     repository = self._config['repositories']['app2_dd']
    //     # sudo RESTIC_REPOSITORY=test/repositories/app2 RESTIC_PASSWORD=bca restic dump cbaa5728c139b8043aa1e8256bfe005ec572abb709eb3ced620717d4243758e1 / > /tmp/prout.tar

    //     response = call_restic(
    //                     cmd='dump',
    //                     args=['cbaa5728c139b8043aa1e8256bfe005ec572abb709eb3ced620717d4243758e1', '/sources/.truc'],
    //                     env=self._get_restic_repository_envs(repository),
    //                     logger=self._logger,
    //                     json=True
    //                 )['stdout']




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
