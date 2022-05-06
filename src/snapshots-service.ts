
export interface Snapshot {
    date: Date,
    device: string,
    backup: string,
    job: string,
    repository: string,
    id: string
    objects?: object[]
}



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

