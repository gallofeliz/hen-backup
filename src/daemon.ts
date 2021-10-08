import { Logger } from './logger'
import { Config } from './config'
import FnScheduler from './fn-scheduler'
import JobsManager, { Job } from './jobs-manager'
import FsWatcher from './fs-watcher'
import callRestic from './restic'
import { once } from 'events'

export default class Daemon {
    protected config: Config
    protected logger: Logger
    protected fnSchedulers: FnScheduler[] = []
    protected jobsManager: JobsManager
    protected started = false
    protected fsWatchers: FsWatcher[] = []

    constructor(config: Config, logger: Logger) {
        this.config = config
        this.logger = logger
        this.jobsManager = new JobsManager(logger)
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
                    const resticCall = callRestic(
                        'init',
                        [],
                        {
                            uploadLimit: this.config.uploadLimit,
                            downloadLimit: this.config.downloadLimit,
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

    protected async checkRepository(repositoryName: string, trigger:'scheduler' | 'api', priority=null, logger=null) {
        const repository = this.config.repositories[repositoryName]

        return this.jobsManager.addJob(
            new Job({
                logger: this.logger,
                trigger: trigger,
                operation: 'check',
                subjects: {repository: repositoryName},
                fn: async (job) => {
                    await this.unlockRepository(repository, job)

                    const resticCall = callRestic(
                        'check',
                        [],
                        {
                            uploadLimit: this.config.uploadLimit,
                            downloadLimit: this.config.downloadLimit,
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

    protected async unlockRepository(repository: Config['repositories'][0], job: Job) {
        const resticCall = callRestic(
            'unlock',
            [],
            {
                uploadLimit: this.config.uploadLimit,
                downloadLimit: this.config.downloadLimit,
                repository: repository,
                logger: job.getLogger()
            }
        )

        job.once('abort', () => resticCall.abort())

        await once(resticCall, 'finish')
    }

    protected backup(backupName: string, trigger:'scheduler' | 'fswatcher' | 'api', priority=null, logger=null) {
        console.log('backup ' + backupName)
        return
        const backup = this.config.backups[backupName]

        return this.jobsManager.addJob(
            new Job({
                logger: this.logger,
                trigger: trigger,
                operation: 'backup',
                subjects: {backup: backupName},
                fn: async () => {
                },
                priority: priority || backup.priority
            })
        )
    }

    protected prune(backupName: string, trigger:'scheduler' | 'api', priority=null, logger=null) {
        console.log('prune', backupName)    }
}
