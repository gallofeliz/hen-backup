import HttpServer from 'js-libs/http-server'
import { Logger } from 'js-libs/logger'
import Application from './application'
import { mapValues, pick } from 'lodash'
import RepositoriesService from './repositories-service'

/** @type integer */
type integer = number

export interface ApiConfig {
    port: integer
    users?: Array<{
        username: string
        password: string
    }>
}

export default class Api extends HttpServer {
    constructor(
        {config, logger, device, repositoriesService, backupService}:
        {config: ApiConfig, logger: Logger, device: string, repositoriesService: RepositoriesService, backupService: BackupService }
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

        // apiRouter.get('/jobs', async (req, res) => {
        //     res.send(await daemon.getJobs())
        // })

        // apiRouter.get('/summary', async (req, res) => {
        //     res.send(await daemon.getSummary())
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

        // apiRouter.get('/snapshots', async (req, res, next) => {
        //     try {
        //         res.send(await daemon.listSnapshots({
        //             ...req.query.backup && {backupName: req.query.backup as string},
        //             ...req.query.repository && {repositoryName: req.query.repository as string},
        //         }, 'api'))
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

/*
Jobs summary

    public async getSummary({withRunLogs = false, withSuccessResult = false, withWarnings = false} = {}) {
        return {
            uuid: this.getUuid(),
            createdAt: this.getCreatedAt(),
            startedAt: this.getStartedAt(),
            endedAt: this.getEndedAt(),
            state: this.getState(),
            priority: this.getPriority(),
            trigger: this.getTrigger(),
            operation: this.getOperation(),
            subjects: this.getSubjects(),
            warnings: withWarnings ? this.warnings : this.warnings.length,
            ...this.getState() === 'failure' && { error: await (this.getResult().catch(e => e.toString())) },
            ...this.getState() === 'success' && withSuccessResult && { result: await this.getResult() },
            ...withRunLogs && { runLogs: this.getRunLogs() }
        }
    }


*/
