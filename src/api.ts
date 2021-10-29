import { Logger } from './logger'
import { ApiConfig } from './config'
import Daemon from './daemon'
import express from 'express'
import { Server } from 'http'
import basicAuth from 'express-basic-auth'
import { json as jsonParser } from 'body-parser'
import { basename } from 'path'
import { Socket } from 'net'

export default class Api {
    protected logger: Logger
    protected app: express.Application
    protected server?: Server
    protected config: ApiConfig
    protected connections: Record<string, Socket> = {}

    constructor(config: ApiConfig, daemon: Daemon, logger: Logger) {
        this.logger = logger

        this.app = express()
        this.config = config

        this.app.use(basicAuth({
            users: config.users.reduce((dict, user) => ({...dict, [user.username]: user.password}), {}),
            challenge: true
        }))

        this.app.use(jsonParser())

        const apiRouter = express.Router()
        this.app.use('/api', apiRouter)
        this.app.use('/', express.static('webui'))

        apiRouter.get('/config', (req, res) => {
            res.send(daemon.getConfigSummary())
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
                res.send(await daemon.getJob(req.params.job))
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
