import { Logger } from './logger'
import { ApiConfig } from './config'
import Daemon from './daemon'
import express from 'express'
import { Server } from 'http'
import basicAuth from 'express-basic-auth'
import { json as jsonParser } from 'body-parser'

export default class Api {
    protected logger: Logger
    protected app: express.Application
    protected server?: Server
    protected config: ApiConfig

    constructor(config: ApiConfig, daemon: Daemon, logger: Logger) {
        this.logger = logger
        this.app = express()
        this.config = config

        this.app.use(basicAuth({users: { [config.credentials.username]: config.credentials.password }, challenge: true}))
        this.app.use(jsonParser())

        const apiRouter = express.Router()
        this.app.use('/api', apiRouter)

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

        apiRouter.get('/jobs', (req, res) => {
            res.send(daemon.getJobsSummary())
        })

        apiRouter.get('/snapshots', async (req, res) => {
            res.send(await daemon.listSnapshots({
                backupName: req.query.backup as string | undefined,
                repositoryName: req.query.repository as string | undefined,
            }, 'api'))
        })

        apiRouter.get('/snapshots/:repository/:snapshot', async (req, res) => {
            res.send(await daemon.getSnapshot(req.params.repository, req.params.snapshot))
        })
    }

    public start() {
        if (this.server) {
            return
        }
        this.server = this.app.listen(this.config.port)
    }


    public stop() {
        if (!this.server) {
            return
        }
        this.server.close()
        delete this.server
    }
}
