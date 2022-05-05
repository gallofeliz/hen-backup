import HttpServer from 'js-libs/http-server'
import { ApiConfig } from './definitions'
import { Logger } from 'js-libs/logger'
import Application from './application'
import { mapValues, pick } from 'lodash'

export default class Api extends HttpServer {
    constructor(
        {config, logger}:
        {config: ApiConfig, logger: Logger}
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
                ]
            }
        })
    }
}



import { basename } from 'path'

export  class ApiOld {
    protected logger: Logger
    protected app: express.Application
    protected server?: Server
    protected config: ApiConfig
    protected connections: Record<string, Socket> = {}

    constructor(config: ApiConfig, daemon: Daemon, logger: Logger) {

        get('/config', () => {
                                        res.send({
                                hostname: appConfig.hostname,
                                repositories: mapValues(appConfig.repositories, (repository) => pick(repository, 'name') ),
                                backups: mapValues(appConfig.backups, (backup) => pick(backup, 'name', 'repositories') )
                            })
        })

        apiRouter.get('/stats/repositories', async (req, res, next) => {
            try {
                res.send(await daemon.getRepositoriesStats())
            } catch (e) {
                next(e)
            }
        })

        apiRouter.post('/repositories/:repository/check', (req, res) => {
            daemon.checkRepository(req.params.repository, 'api', req.query.priority as string | undefined)
            res.end()
        })

        apiRouter.post('/backups/:backup/backup', (req, res) => {
            daemon.backup(req.params.backup, 'api', req.query.priority as string | undefined)
            res.end()
        })

        apiRouter.post('/backups/:backup/prune', (req, res) => {
            daemon.prune(req.params.backup, 'api', req.query.priority as string | undefined)
            res.end()
        })

        apiRouter.get('/jobs', async (req, res) => {
            res.send(await daemon.getJobs())
        })

        apiRouter.get('/summary', async (req, res) => {
            res.send(await daemon.getSummary())
        })

        apiRouter.get('/jobs/:job', async (req, res, next) => {
            try {
                res.send(await daemon.getJob(req.params.job).toJson(true))
            } catch (e) {
                next(e)
            }
        })

        apiRouter.get('/jobs/:job/realtime-logs', (req, res, next) => {
            try {
                const job = daemon.getJob(req.params.job)
                const fromBeginning = !!req.query['from-begin']

                res.set('Content-Type', 'application/x-ndjson')

                if (fromBeginning) {
                    job.getRunLogs().forEach(runLog => res.write(JSON.stringify(runLog) + '\n'))
                }

                if (['success', 'failure', 'aborted', 'canceled'].includes(job.getState())) {
                    return res.end()
                }

                job.on('log', (runLog) => {
                    res.write(JSON.stringify(runLog) + '\n')
                })

                const close = () => {
                    res.end()
                    req.off('close', close)
                }

                req.once('close', close)
                job.once('canceled', close)
                job.once('ended', close)
            } catch (e) {
                next(e)
            }
        })

        apiRouter.get('/snapshots', async (req, res, next) => {
            try {
                res.send(await daemon.listSnapshots({
                    ...req.query.backup && {backupName: req.query.backup as string},
                    ...req.query.repository && {repositoryName: req.query.repository as string},
                }, 'api'))
            } catch (e) {
                next(e)
            }
        })

        apiRouter.get('/snapshots/:repository/:snapshot', async (req, res, next) => {
            try {
                res.send(await daemon.getSnapshot(req.params.repository, req.params.snapshot, 'api'))
            } catch (e) {
                next(e)
            }
        })

        apiRouter.get('/snapshots/:repository/:snapshot/content', async (req, res, next) => {
            try {
                const format = req.query.type === 'zip' ? 'zip' : 'tar'
                const path = req.query.path as string || '/'
                const filename = req.query.type === 'dir' ? req.params.snapshot+'.'+format : basename(path)
                res.header('Content-Disposition', 'attachment; filename="'+filename+'"')
                res.send(await daemon.downloadSnapshot(req.params.repository, req.params.snapshot, res, path, format, 'api'))
            } catch (e) {
                next(e)
            }
        })

        this.app.use((err: Error, req: any, res: any, next: any) => {
            this.logger.notice('API error', { e: err })
            res.status(500).send(err.toString());
        });

    }

    public start() {
        if (this.server) {
            return
        }
        this.server = this.app.listen(this.config.port)

        this.server.on('connection', (conn) => {
            const key = conn.remoteAddress + ':' + conn.remotePort;
            this.connections[key] = conn;
            conn.on('close', () => {
                delete this.connections[key];
            });
        });
    }


    public stop() {
        if (!this.server) {
            return
        }

        this.server.close()

        Object.keys(this.connections).forEach(key => this.connections[key].destroy())

        delete this.server
    }
}
