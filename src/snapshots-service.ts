import RepositoriesService from './repositories-service'
import BackupService from './backup-service'
import JobsService from './jobs-service'
import { Logger } from 'js-libs/logger'
import ResticClient from './restic-client'
import { NetworkLimit } from './application'

export interface Snapshot {
    date: Date,
    device: string,
    backup: string,
    job: string,
    repository: string,
    id: string
    objects?: object[]
}

export default class SnapshotsService {
    protected repositoriesService: RepositoriesService
    protected backupService: BackupService
    protected jobsService: JobsService
    protected logger: Logger
    protected resticClient: ResticClient
    protected networkLimit: NetworkLimit

    constructor(
        {repositoriesService, backupService, jobsService, logger, resticClient, networkLimit}:
        { repositoriesService: RepositoriesService, backupService: BackupService, jobsService: JobsService,
          logger: Logger, resticClient: ResticClient, networkLimit: NetworkLimit}
    ) {
        this.repositoriesService = repositoriesService
        this.backupService = backupService
        this.jobsService = jobsService
        this.logger = logger
        this.resticClient = resticClient
        this.networkLimit = networkLimit
    }

    public async listSnapshots(
        {device, backupName, repositoryName}: {device?: string, backupName?: string, repositoryName?: string},
        trigger: 'api'
    ): Promise<Snapshot[]> {
        const repositories = (() => {
            if (repositoryName) {
                return [this.repositoriesService.getRepository(repositoryName)]
            }

            if (backupName) {
                return this.backupService.getBackup(backupName).repositories
                    .map(repositoryName => this.repositoriesService.getRepository(repositoryName))
            }

            return this.repositoriesService.getRepositories()
        })()

        return this.jobsService.run({
            priority: 'immediate',
            id: {
                trigger,
                operation: 'listSnapshots',
                subjects: {
                    ...device && {device},
                    ...backupName && {backup: backupName},
                    ...repositoryName && {repository: repositoryName}
                }
            },
            logger: this.logger,
            fn: async ({abortSignal, logger}) => {
                const snapshots = []

                for (const repository of repositories) {
                    const resticSnapshots = await this.resticClient.listSnapshots({
                        logger,
                        abortSignal,
                        repository,
                        networkLimit: this.networkLimit,
                        hostname: device,
                        tags: {
                            ...backupName && {backup: backupName},
                        }
                    })

                    snapshots.push(
                        ...resticSnapshots.map(resticSnapshot => ({
                            date: new Date(resticSnapshot.time),
                            device: resticSnapshot.hostname,
                            backup: resticSnapshot.tags.backup,
                            job: resticSnapshot.tags.job,
                            repository: repository.name,
                            id: resticSnapshot.id
                        }))
                    )
                }
            }
        }, true)
    }

    public async getSnapshot(repositoryName: string, snapshotId: string, trigger: 'api'): Promise<Snapshot> {
        const repository = this.repositoriesService.getRepository(repositoryName)

        return this.jobsService.run({
            priority: 'immediate',
            id: {
                trigger,
                operation: 'getSnapshot',
                subjects: {
                    repository: repository.name,
                    snapshotId
                }
            },
            logger: this.logger,
            fn: async ({abortSignal, logger}) => {

                const resticSnapshot = await this.resticClient.getSnapshot({
                    logger,
                    abortSignal,
                    repository,
                    networkLimit: this.networkLimit,
                    snapshotId
                })

                return {
                    date: new Date(resticSnapshot.time),
                    device: resticSnapshot.hostname,
                    backup: resticSnapshot.tags.backup,
                    job: resticSnapshot.tags.job,
                    repository: repository.name,
                    id: resticSnapshot.id,
                    objects: resticSnapshot.objects
                }
            }
        }, true)
    }

    public downloadSnapshot(repositoryName: string, snapshotId: string, stream: NodeJS.WritableStream, path: string, format: 'tar' | 'zip', trigger: 'api', priority?: JobPriority) {
        const repository = this.repositoriesService.getRepository(repositoryName)

        this.jobsService.run({
            priority: priority || 'next',
            id: {
                trigger,
                operation: 'downloadSnapshot',
                subjects: {
                    repository: repository.name,
                    snapshotId,
                    path,
                    format
                    // WARNING in case of double, stream will be broken (add option or random subject ?)
                }
            },
            logger: this.logger,
            fn: async ({abortSignal, logger}) => {

                await this.resticClient.downloadSnapshot({
                    logger,
                    abortSignal,
                    repository,
                    networkLimit: this.networkLimit,
                    snapshotId,
                    format,
                    path,
                    stream
                })

            }
        })
    }
}

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

