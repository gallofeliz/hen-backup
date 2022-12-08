import { Duration } from 'js-libs/utils'
import { ResticForgetPolicy} from './restic-client'
import JobsService, { JobPriority, Job } from './jobs-service'
import RepositoriesService from './repositories-service'
import ResticClient from './restic-client'
import { NetworkLimit } from './application'
import FnScheduler, { Schedule } from 'js-libs/fn-scheduler'
import FsWatcher from 'js-libs/fs-watcher'
import { Logger } from 'js-libs/logger'
import { zipObject } from 'lodash'
import httpRequest, { HttpRequestConfig } from 'js-libs/http-request'
import runProcess from 'js-libs/process'

interface BackupBaseHook {
    onfailure?: 'continue' | 'stop' | 'ignore'
}

interface BackupHttpHook extends BackupBaseHook, Pick<HttpRequestConfig, 'url' | 'method' | 'timeout' | 'retries'> {
    type: 'http'
}

type BackupHook = BackupHttpHook

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
        before?: BackupHook
    }
}

export interface BackupsSummary {
    [backupName: string]: Record<'backup' | 'prune', {
        lastEndedJob: Job<void> | undefined
        runningJob: Job<void> | undefined
        queuingJob: Job<void> | undefined
        nextSchedule: Date | undefined | null
    }>
}

export default class BackupService {
    protected jobsService: JobsService
    protected repositoriesService: RepositoriesService
    protected resticClient: ResticClient
    protected backups: Backup[]
    protected networkLimit: NetworkLimit
    protected schedulers: FnScheduler[] = []
    protected watchers: FsWatcher[]
    protected logger: Logger
    protected device: string

    constructor(
        {jobsService, resticClient, backups, networkLimit, logger, device, repositoriesService}:
        {jobsService: JobsService, resticClient: ResticClient, backups: Backup[], logger: Logger
         networkLimit: NetworkLimit, device: string, repositoriesService: RepositoriesService }
    ) {
        this.jobsService = jobsService
        this.repositoriesService = repositoriesService
        this.resticClient = resticClient
        this.backups = backups
        this.networkLimit = networkLimit
        this.logger = logger
        this.device = device

        this.schedulers.push(
            ...this.backups
                .filter(backup => backup.schedules)
                .map(backup => new FnScheduler({
                    id: { operation: 'backup', backup: backup.name },
                    fn: () => this.backup(backup.name, 'scheduler'),
                    logger: this.logger,
                    schedules: backup.schedules!,
                    runOnStart: true
                }))
        )

        this.schedulers.push(
            ...this.backups
                .filter(backup => backup.prune?.schedules)
                .map(backup => new FnScheduler({
                    id: { operation: 'prune', backup: backup.name },
                    fn: () => this.prune(backup.name, 'scheduler'),
                    logger: this.logger,
                    schedules: backup.prune!.schedules!,
                    runOnStart: true
                }))
        )

        this.watchers = this.backups
            .filter(backup => backup.watch)
            .map(backup => new FsWatcher({
                id: { operation: 'backup', backup: backup.name },
                fn: () => this.backup(backup.name, 'fswatcher'),
                paths: backup.paths,
                ignore: backup.excludes,
                logger: this.logger,
                waitMin: backup.watch!.wait?.min,
                waitMax: backup.watch!.wait?.max
            }))
    }

    public async start() {
        this.schedulers.forEach(fnSch => fnSch.start())
        this.watchers.forEach(fnSch => fnSch.start())
    }

    public async stop() {
        this.schedulers.forEach(fnSch => fnSch.stop())
        this.watchers.forEach(fnSch => fnSch.stop())
    }

    public getBackups() {
        return this.backups
    }

    public getBackup(name: string) {
        const backup = this.backups.find(backup => backup.name === name)

        if (!backup) {
            throw new Error('Unknown backup ' + name)
        }

        return backup
    }

    public backup(backupName: string, trigger: 'scheduler' | 'fswatcher' | 'api', priority?: JobPriority) {
        const backup = this.getBackup(backupName)

        this.jobsService.run({
            priority: priority || backup.priority,
            id: {
                trigger,
                operation: 'backup',
                subjects: { backup: backup.name }
            },
            logger: this.logger,
            // try for backups
            allocatedTime: '6h',
            duplicable: true,
            // ---------------
            fn: async ({abortSignal, logger, job}) => {

                const repositories = backup.repositories.map(name => this.repositoriesService.getRepository(name))
                const beforeHookOk = await (async () => {
                    if (backup.hooks?.before) {
                        try {
                            await this.handleHook(backup.hooks.before, abortSignal, logger)
                            return true
                        } catch (e) {
                            switch (backup.hooks.before.onfailure) {
                                case 'stop':
                                    throw e
                                case 'ignore':
                                    logger.warning('Before Hook failed, ignoring', {error: e})
                                    return true
                                case 'continue':
                                default:
                                    logger.info('Before Hook failed, continue but job will be fails', {error: e})
                                    return false
                            }
                        }
                    }
                })()

                let allRepositoryOk = true

                for (const repository of repositories) {
                    try {
                        await this.resticClient.backup({
                            logger,
                            abortSignal,
                            repository,
                            networkLimit: this.networkLimit,
                            paths: backup.paths,
                            excludes: backup.excludes,
                            hostname: this.device,
                            tags: {
                                backup: backup.name,
                                job: job.getUuid()
                            }
                        })
                    } catch (e) {
                        allRepositoryOk = false
                        logger.info('Repository backup failed, job will be failed', {repository: repository.name, error: e})
                    }
                }

                if (!beforeHookOk || !allRepositoryOk) {
                    throw new Error('One hook or repository backup failed')
                }
            }
        })
    }

    public generateManualSpnapshot(backupName: string, stream: NodeJS.WritableStream, trigger: 'api', priority?: JobPriority) {
        const backup = this.getBackup(backupName)

        return this.jobsService.run({
            priority: priority || 'immediate',
            id: {
                trigger,
                operation: 'generateManualSpnapshot',
                subjects: { backup: backup.name }
            },
            logger: this.logger,
            fn: async ({abortSignal, logger}) => {

                const beforeHookOk = await (async () => {
                    if (backup.hooks?.before) {
                        try {
                            await this.handleHook(backup.hooks.before, abortSignal, logger)
                            return true
                        } catch (e) {
                            switch (backup.hooks.before.onfailure) {
                                case 'stop':
                                    throw e
                                case 'ignore':
                                    logger.warning('Before Hook failed, ignoring', {error: e})
                                    return true
                                case 'continue':
                                default:
                                    logger.info('Before Hook failed, continue but job will be fails', {error: e})
                                    return false
                            }
                        }
                    }
                })()

                await runProcess({
                    logger,
                    abortSignal,
                    cmd: 'tar',
                    args: [
                        '-cf',
                        '-'
                        // gpg -c --passphrase-fd 1
                    ]
                    .concat(backup.paths)
                    .concat(backup.excludes ? backup.excludes.reduce((args: string[], exclude) => [...args, '--exclude', exclude], []) : []),
                    outputStream: stream
                })

                if (!beforeHookOk) {
                    throw new Error('One hook failed')
                }
            }
        }, true, true)
    }

    public prune(backupName: string, trigger: 'scheduler' | 'api', priority?: JobPriority) {
        const backup = this.getBackup(backupName)

        if (!backup.prune?.retentionPolicy) {
            throw new Error('No prune policy for backup ' + backupName)
        }

        this.jobsService.run({
            priority: priority || backup.priority,
            id: {
                trigger,
                operation: 'prune',
                subjects: { backup: backup.name }
            },
            logger: this.logger,
            fn: async ({abortSignal, logger}) => {
                const repositories = backup.repositories.map(name => this.repositoriesService.getRepository(name))
                let allRepositoryOk = true

                for (const repository of repositories) {
                    try {
                        await this.resticClient.forgetAndPrune({
                            logger,
                            abortSignal,
                            repository,
                            networkLimit: this.networkLimit,
                            hostname: this.device,
                            tags: {
                                backup: backup.name,
                            },
                            policy: backup.prune!.retentionPolicy
                        })
                    } catch (e) {
                        allRepositoryOk = false
                        logger.info('Repository prune failed, job will be failed', {repository: repository.name, error: e})
                    }
                }

                if (!allRepositoryOk) {
                    throw new Error('One repository prune failed')
                }
            }
        })
    }

    public async getSummary(): Promise<BackupsSummary> {
        return zipObject(
            this.backups.map(b => b.name),
            await Promise.all(this.backups.map(async backup => {
                return {
                    backup: {
                        lastEndedJob: await this.jobsService
                            .findEndedJob({'id.operation': 'backup', 'id.subjects.backup': backup.name}, {endedAt: -1}),
                        runningJob: await this.jobsService
                            .findRunningJob({'id.operation': 'backup', 'id.subjects.backup': backup.name}),
                        queuingJob: await this.jobsService
                            .findQueuingJob({'id.operation': 'backup', 'id.subjects.backup': backup.name}),
                        nextSchedule: this.schedulers
                            .find(scheduler => scheduler.getId().operation === 'backup' && scheduler.getId().backup === backup.name)
                            ?.getNextScheduledDate()
                    },
                    prune: {
                        lastEndedJob: await this.jobsService
                            .findEndedJob({'id.operation': 'prune', 'id.subjects.backup': backup.name}, {endedAt: -1}),
                        runningJob: await this.jobsService
                            .findRunningJob({'id.operation': 'prune', 'id.subjects.backup': backup.name}),
                        queuingJob: await this.jobsService
                            .findQueuingJob({'id.operation': 'prune', 'id.subjects.backup': backup.name}),
                        nextSchedule: this.schedulers
                            .find(scheduler => scheduler.getId().operation === 'prune' && scheduler.getId().backup === backup.name)
                            ?.getNextScheduledDate()
                    }
                }
            }))
        )
    }

    protected async handleHook(hook: BackupHook, abortSignal: AbortSignal, logger: Logger) {
        // for the moment, only Http, so need to disciminate

        return httpRequest({...hook, abortSignal, logger})
    }
}
