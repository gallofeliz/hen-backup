import HttpServer from 'js-libs/http-server'
import { Logger } from 'js-libs/logger'
import Application from './application'
import { mapValues, pick } from 'lodash'
import RepositoriesService, { RepositoriesSummary } from './repositories-service'
import BackupService, { BackupsSummary } from './backup-service'
import SnapshotsService from './snapshots-service'
import JobsService, { Job } from './jobs-service'
import FnScheduler from 'js-libs/fn-scheduler'
import { realtimeLogs } from 'js-libs/jobs-server-helpers'

/** @type integer */
type integer = number

export interface ApiConfig {
    port: integer
    users?: Array<{
        username: string
        password: string
    }>
}

function jobToJson(job: Job<any>) {
    return {
        uuid: job.getUuid(),
        createdAt: job.getCreatedAt(),
        startedAt: job.getStartedAt(),
        endedAt: job.getEndedAt(),
        state: job.getState(),
        priority: job.getPriority(),
        id: job.getId(),
        warnings: job.getWarnings(),
        error: job.getState() === 'failed' && job.getError().toString()
    }
}

function summaryToJson(summary: RepositoriesSummary | BackupsSummary) {
    return mapValues(summary, operations => mapValues(operations, (values: any) => ({
        lastEndedJob: values.lastEndedJob ? jobToJson(values.lastEndedJob) : null,
        runningJob: values.runningJob ? jobToJson(values.runningJob) : null,
        queuingJob: values.queuingJob ? jobToJson(values.queuingJob) : null,
        nextSchedule: values.nextSchedule || null
    })))
}

export default class Api extends HttpServer {
    constructor(
        {config, logger, device, repositoriesService, backupService, snapshotsService, jobsService}:
        {config: ApiConfig, logger: Logger, device: string, repositoriesService: RepositoriesService,
         backupService: BackupService, snapshotsService: SnapshotsService, jobsService: JobsService }
    ) {
        super({
            port: config.port,
            auth: config.users && {
                users: config.users
            },
            webUiFilesPath: 'webui',
            logger,
            api: {
                prefix: 'api',
                routes: [
                    {
                        method: 'get',
                        path: '/config',
                        handler(req, res) {
                            res.send({
                                device,
                                repositories: repositoriesService.getRepositories().map(repo => pick(repo, 'name')),
                                backups: backupService.getBackups().map(backup => pick(backup, 'name', 'repositories'))
                            })
                        }
                    },
                    {
                        method: 'get',
                        path: '/jobs',
                        async handler(req, res) {
                            res.send(mapValues(
                                await jobsService.getJobs(true),
                                jobs => jobs.map(jobToJson)
                            ))
                        }
                    },
                    {
                        method: 'get',
                        path: '/summary',
                        async handler(req, res) {
                            res.send({
                                repositories: summaryToJson(repositoriesService.getSummary()),
                                backups: summaryToJson(backupService.getSummary())
                            })
                        }
                    },
                    {
                        method: 'get',
                        path: '/snapshots',
                        async handler(req, res) {
                            res.send(await snapshotsService.listSnapshots({
                                backupName: req.query.backup as string | undefined,
                                repositoryName: req.query.repository as string | undefined,
                                device: req.query.device as string | undefined
                            }, 'api'))
                        }
                    },
                    {
                        method: 'get',
                        path: '/jobs/:job/realtime-logs',
                        async handler(req, res) {
                            const job = jobsService.getJob(req.params.job)
                            realtimeLogs({job, req, res, fromBeginning: true})
                        }
                    }

        // apiRouter.get('/stats/repositories', async (req, res, next) => {
        //     try {
        //         res.send(await daemon.getRepositoriesStats())
        //     } catch (e) {
        //         next(e)
        //     }
        // })

        // apiRouter.post('/repositories/:repository/check', (req, res) => {
        //     daemon.checkRepository(req.params.repository, 'api', req.query.priority as string | undefined)
        //     res.end()
        // })

        // apiRouter.post('/backups/:backup/backup', (req, res) => {
        //     daemon.backup(req.params.backup, 'api', req.query.priority as string | undefined)
        //     res.end()
        // })

        // apiRouter.post('/backups/:backup/prune', (req, res) => {
        //     daemon.prune(req.params.backup, 'api', req.query.priority as string | undefined)
        //     res.end()
        // })

        // apiRouter.get('/jobs/:job', async (req, res, next) => {
        //     try {
        //         res.send(await daemon.getJob(req.params.job).toJson(true))
        //     } catch (e) {
        //         next(e)
        //     }
        // })

        // apiRouter.get('/jobs/:job/realtime-logs', (req, res, next) => {
        //     try {
        //         const job = daemon.getJob(req.params.job)
        //         const fromBeginning = !!req.query['from-begin']

        //         res.set('Content-Type', 'application/x-ndjson')

        //         if (fromBeginning) {
        //             job.getRunLogs().forEach(runLog => res.write(JSON.stringify(runLog) + '\n'))
        //         }

        //         if (['success', 'failure', 'aborted', 'canceled'].includes(job.getState())) {
        //             return res.end()
        //         }

        //         job.on('log', (runLog) => {
        //             res.write(JSON.stringify(runLog) + '\n')
        //         })

        //         const close = () => {
        //             res.end()
        //             req.off('close', close)
        //         }

        //         req.once('close', close)
        //         job.once('canceled', close)
        //         job.once('ended', close)
        //     } catch (e) {
        //         next(e)
        //     }
        // })


        // apiRouter.get('/snapshots/:repository/:snapshot', async (req, res, next) => {
        //     try {
        //         res.send(await daemon.getSnapshot(req.params.repository, req.params.snapshot, 'api'))
        //     } catch (e) {
        //         next(e)
        //     }
        // })

        // apiRouter.get('/snapshots/:repository/:snapshot/content', async (req, res, next) => {
        //     try {
        //         const format = req.query.type === 'zip' ? 'zip' : 'tar'
        //         const path = req.query.path as string || '/'
        //         const filename = req.query.type === 'dir' ? req.params.snapshot+'.'+format : basename(path)
        //         res.header('Content-Disposition', 'attachment; filename="'+filename+'"')
        //         res.send(await daemon.downloadSnapshot(req.params.repository, req.params.snapshot, res, path, format, 'api'))
        //     } catch (e) {
        //         next(e)
        //     }
        // })



                ]
            }
        })
    }
}
