import Logger from './logger'
import { Config } from './config'
import FnScheduler from './fn-scheduler'
import JobsManager, { Job } from './jobs-manager'
import FsWatcher from './fs-watcher'

export default class Daemon {
    protected config: Config
    protected logger: Logger
    protected fnSchedulers: FnScheduler[] = []
    protected jobsManager: JobsManager
    protected started = false
    protected fsWatchers: FsWatcher[] = []

    constructor(config: Config, logger: Logger) {
        this.config = config
        this.logger = logger.child('daemon')
        this.jobsManager = new JobsManager
        this.configureTriggers()
    }

    public start() {
        if (this.started) {
            return
        }
        this.started = true
        this.logger.info('Starting')
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
        this.logger.info('Stopping')
        this.started = false
        this.fnSchedulers.forEach(fnScheduler => fnScheduler.stop())
        this.fsWatchers.forEach(fsWatcher => fsWatcher.stop())
        this.jobsManager.stop()
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
                trigger: null,
                operation: 'init',
                subjects: {repository: repositoryName},
                fn: () => {
                    console.log('Init ' + repositoryName)
                },
                priority: 'next'
            })
        )

        // def do_init_repository():
        //     self._logger.info('Starting repository initialization', extra={
        //         'component': 'daemon',
        //         'action': 'init_repository',
        //         'repository': repository['name'],
        //         'status': 'starting'
        //     })

        //     try:
        //         call_restic(cmd='init', args=self._get_restic_global_opts(), env=self._get_restic_repository_envs(repository), logger=self._logger)
        //         self._logger.info('Initialization ended :)', extra={
        //             'component': 'daemon',
        //             'action': 'init_repository',
        //             'repository': repository['name'],
        //             'status': 'success'
        //         })
        //     except Exception as e:
        //         self._logger.info('Unable to init ; probably already init else error ('+str(e)+')', extra={
        //             'component': 'daemon',
        //             'action': 'init_repository',
        //             'repository': repository['name'],
        //             'status': 'failure'
        //         })

        //         self._unlock_repository(repository)
        // return self._task_manager.add_task(
        //     task=Task(fn=do_init_repository, priority=priority, id="init_repo_%s" % repository_name),
        //     ignore_if_duplicate=True,
        //     get_result=False
        // )
    }

    protected async checkRepository(repositoryName: string, trigger:'scheduler' | 'api', priority=null, logger=null) {
        const repository = this.config.repositories[repositoryName]

        return this.jobsManager.addJob(
            new Job({
                trigger: trigger,
                operation: 'check',
                subjects: {repository: repositoryName},
                fn: () => {
                    console.log('Check repo ' + repositoryName)
                },
                priority: priority || repository.check!.priority
            })
        )
    }

    protected backup(backupName: string, trigger:'scheduler' | 'fswatcher' | 'api', priority=null, logger=null) {
        const backup = this.config.backups[backupName]

        return this.jobsManager.addJob(
            new Job({
                trigger: trigger,
                operation: 'backup',
                subjects: {backup: backupName},
                fn: () => {
                    console.log('backup ' + backupName)
                },
                priority: priority || backup.priority
            })
        )
    }

    protected prune(backupName: string, trigger:'scheduler' | 'api', priority=null, logger=null) {
        console.log('prune', backupName)    }
}
