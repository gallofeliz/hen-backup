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
                    () => this.checkRepository(repository.name),
                    repository.check!.schedules,
                    true
                )
            )
        })





        // for backup_name in config['backups']:
        //     backup = config['backups'][backup_name]

        //     if backup.get('schedules'):
        //         self._schedules.append(
        //             schedule(
        //                 backup['schedules'],
        //                 self.backup,
        //                 kwargs={
        //                     'backup_name': backup_name,
        //                     'caller_node': TreeNode('Daemon-schedule')
        //                 },
        //                 runAtBegin=True,
        //                 scheduler=scheduler,
        //                 on_error=self._logger.exception
        //             )
        //         )

        //     if backup.get('watch'):
        //         self._fswatchers.append(
        //             create_fswatch_callback(**{
        //                 'paths':backup['paths'],
        //                 'ignore':backup.get('excludes', []),
        //                 'fn': self.backup,
        //                 'kwargs': {
        //                     'backup_name': backup_name,
        //                     'caller_node': TreeNode('Daemon-watch')
        //                 },
        //                 'logger': self._logger,
        //                 'on_error': self._logger.exception,
        //                 **({
        //                     'wait_min': convert_to_seconds(backup['watch']['wait']['min']),
        //                     'wait_max': convert_to_seconds(backup['watch']['wait']['max'])
        //                 } if type(backup['watch']) is not bool and backup['watch'].get('wait') else {})
        //             })
        //         )

        //     if backup.get('prune') and 'schedules' in backup['prune']:
        //         self._schedules.append(
        //             schedule(
        //                 backup['prune']['schedules'],
        //                 self.prune,
        //                 kwargs={
        //                     'backup_name': backup_name,
        //                 },
        //                 runAtBegin=False,
        //                 scheduler=scheduler,
        //                 on_error=self._logger.exception
        //             )
        //         )

    }

    protected initRepository(repositoryName: string, priority='next') {
    }

    protected checkRepository(repositoryName: string, priority=null) {
    }
}
