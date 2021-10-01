import Logger from './logger'
import { Config } from './config'
import FnScheduler from './fn-scheduler'
import JobsManager from './jobs-manager'
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

    protected initRepository(repositoryName: string, priority=null) {
        console.log('init', repositoryName)
    }

    protected checkRepository(repositoryName: string, trigger:'scheduler' | 'api', priority=null, logger=null) {
        console.log('check', repositoryName)
    }

    protected backup(backupName: string, trigger:'scheduler' | 'fswatcher' | 'api', priority=null, logger=null) {
        console.log('backup', backupName, trigger)
    }

    protected prune(backupName: string, trigger:'scheduler' | 'api', priority=null, logger=null) {
        console.log('prune', backupName)
    }
}
