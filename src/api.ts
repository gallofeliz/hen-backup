import HttpServer from 'js-libs/http-server'
import { Logger } from 'js-libs/logger'
import { mapValues, pick } from 'lodash'
import RepositoriesService, { RepositoriesSummary } from './repositories-service'
import BackupService, { BackupsSummary } from './backup-service'
import SnapshotsService from './snapshots-service'
import JobsService, { Job, semanticJobPriorities, JobPriority } from './jobs-service'
import { realtimeLogs } from 'js-libs/jobs-server-helpers'
import { basename } from 'path'

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
        ...job.toJSON(),
        runLogs: undefined
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

//  ts-json-schema-generator --path node_modules/js-libs/jobs.d.ts --type SemanticJobPriority --no-top-ref -f tsconfig.json
function priorityParamToTsValue(priorityParam: string | undefined): JobPriority | undefined {
    if (priorityParam === undefined) {
        return
    }
    if (/^-?[0-9]+$/.test(priorityParam)) {
        return parseInt(priorityParam, 10)
    }

    if(!semanticJobPriorities.includes(priorityParam)) {
        throw new Error('Invalid provided priority')
    }

    return priorityParam as JobPriority
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
                routes: [
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
                            const query = req.query.query ? JSON.parse(req.query.query as string) : {}
                            res.send(mapValues(
                                {
                                    queueing: await jobsService.findQueuingJobs(query),
                                    running: await jobsService.findRunningJobs(query),
                                    ended: await jobsService.findEndedJobs(
                                        query,
                                        {endedAt: -1},
                                        req.query.limit ? parseInt(req.query.limit as string) : 20,
                                        req.query.skip ? parseInt(req.query.skip as string) : 0
                                    )
                                },
                                jobs => jobs.map(jobToJson)
                            ))
                        }
                    },
                    {
                        method: 'get',
                        path: '/summary',
                        async handler(req, res) {
                            res.send({
                                repositories: summaryToJson(await repositoriesService.getSummary()),
                                backups: summaryToJson(await backupService.getSummary())
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
                                device: req.query.device as string | undefined
                            }, 'api'))
                        }
                    },
                    {
                        method: 'get',
                        path: '/jobs/:job/realtime-logs',
                        async handler(req, res) {
                            const job = await jobsService.getJob(req.params.job)
                            realtimeLogs({job, req, res, fromBeginning: true})
                        }
                    },
                    {
                        method: 'post',
                        path: '/jobs/:job/cancel',
                        async handler(req, res) {
                            await jobsService.cancel(req.params.job, 'api')
                            res.end()
                        }
                    },
                    {
                        method: 'post',
                        path: '/jobs/:job/abort',
                        async handler(req, res) {
                            await jobsService.abort(req.params.job, 'api')
                            res.end()
                        }
                    },
                    {
                        method: 'post',
                        path: '/backups/:backup/backup',
                        async handler(req, res) {
                            backupService.backup(req.params.backup, 'api', priorityParamToTsValue(req.query.priority as string | undefined))
                            res.end()
                        }
                    },
                    {
                        method: 'post',
                        path: '/backups/:backup/prune',
                        async handler(req, res) {
                            backupService.prune(req.params.backup, 'api', priorityParamToTsValue(req.query.priority as string | undefined))
                            res.end()
                        }
                    },
                    {
                        method: 'post',
                        path: '/repositories/:repository/check',
                        async handler(req, res) {
                            repositoriesService.checkRepository(req.params.repository, 'api', priorityParamToTsValue(req.query.priority as string | undefined))
                            res.end()
                        }
                    },
                    {
                        method: 'post',
                        path: '/repositories/:repository/measure',
                        async handler(req, res) {
                            repositoriesService.measureRepositorySize(req.params.repository, 'api', priorityParamToTsValue(req.query.priority as string | undefined))
                            res.end()
                        }
                    },
                    {
                        method: 'get',
                        path: '/snapshots/:repository/:snapshot',
                        async handler(req, res) {
                            return snapshotsService.getSnapshot(req.params.repository, req.params.snapshot, 'api')
                        }
                    },
                    {
                        method: 'get',
                        path: '/snapshots/:repository/:snapshot/content',
                        async handler(req, res) {
                            const format = req.query.type === 'zip' ? 'zip' : 'tar'
                            const path = req.query.path as string || '/'
                            const filename = req.query.type === 'dir' ? req.params.snapshot+'.'+format : basename(path)
                            res.header('Content-Disposition', 'attachment; filename="'+filename+'"')
                            try {
                                await snapshotsService.downloadSnapshot(req.params.repository, req.params.snapshotid, res, path, format, 'api')
                            } catch (e) {
                                // How to notify there is an error ???????????????????
                                //req.socket && req.socket.destroy(new Error('bada'))
                            }
                        }
                    }
                ]
            }
        })
    }
}
