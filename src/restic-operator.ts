import { Repository, Backup, Snapshot } from './definitions'
import { Logger } from 'js-libs/logger'
import runProcess, { ProcessConfig } from 'js-libs/process'
import { reduce, flatten, map, omitBy, isNil } from 'lodash'
import { sizeToKiB, durationToSeconds } from 'js-libs/utils'

export interface ResticOperatorConfig {
    device: string
    uploadLimit?: string
    downloadLimit?: string
}

interface ResticSnapshot {
    time: string,
    hostname: string,
    tags: string[]
    id: string
}

// Link Domain with Restic, unitary
export default class ResticOperator {
    protected config: ResticOperatorConfig

    constructor(config: ResticOperatorConfig) {
        this.config = config
    }

    public async initRepository(
        {repository, logger, abortSignal}:
        {repository: Repository, logger: Logger, abortSignal: AbortSignal}
    ) {
        await this.runRestic({
            cmd: 'init',
            repository,
            logger,
            abortSignal
        })
    }

    public async listSnapshots(
        {repository, logger, device, backup, abortSignal}:
        {repository: Repository, logger: Logger, device?: string, backup?: Backup, abortSignal?: AbortSignal}
    ): Promise<Snapshot[]> {
        await this.unlockRepository({repository, logger, abortSignal})

        const resticSnapshots: ResticSnapshot[] = await this.runRestic({
            cmd: 'snapshots',
            outputType: 'json',
            repository,
            logger,
            device,
            abortSignal,
            backup
        })

        return resticSnapshots.map(resticSnapshot => ({
            id: resticSnapshot.id,
            date: new Date(resticSnapshot.time),
            device: resticSnapshot.hostname,
            backup: this.extractValueFromTags(resticSnapshot.tags, 'backup'),
            job: this.extractValueFromTags(resticSnapshot.tags, 'job'),
            repository: repository.name
        }))
    }

    public async forgetAndPrune(
        {repository, logger, abortSignal, backup, device}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal, backup: Backup, device: string}
    ) {
        if (!backup.prune) {
            throw new Error('No prune policy')
        }

        await this.unlockRepository({repository, logger, abortSignal})

        const retentionPolicyMapping: Record<string, string> = {
            'nbOfHourly': 'hourly',
            'nbOfdaily': 'daily',
            'nbOfWeekly': 'weekly',
            'nbOfMonthly': 'monthly',
            'nbOfYearly': 'yearly',
            'minTime': 'within'
        }

        const retentionPolicyArgs: string[] = flatten(map(omitBy(backup.prune.retentionPolicy, isNil), (retentionValue, retentionKey) => {
            if (!retentionPolicyMapping[retentionKey]) {
                throw new Error('Unknown policy rule ' + retentionKey)
            }

            if (retentionKey === 'minTime') {
                retentionValue = durationToSeconds(retentionValue as string)
            }

            return ['--keep-' + retentionPolicyMapping[retentionKey], retentionValue.toString()]
        })) as string[]

        await this.runRestic({
            cmd: 'forget',
            args: ['--prune', ...retentionPolicyArgs],
            repository,
            logger,
            abortSignal,
            device,
            backup
        })
    }

    public async backup(
        {repository, logger, abortSignal, backup, device, job}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal, backup: Backup, device: string, job: string}
    ) {
        await this.unlockRepository({repository, logger, abortSignal})

        await this.runRestic({
            cmd: 'backup',
            args: [
                ...backup.paths,
                ...backup.excludes ? backup.excludes.map(exclude => '--exclude=' + exclude) : []
            ],
            repository,
            logger,
            abortSignal,
            device,
            backup,
            job
        })
    }

    public async downloadSnapshot(
        {repository, logger, abortSignal, format, snapshotId, path}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal, format: 'zip' | 'tar', snapshotId: string, path: string, stream: NodeJS.WritableStream}
    ) {
        await this.unlockRepository({repository, logger, abortSignal})

        await this.runRestic({
            logger,
            repository,
            abortSignal,
            cmd: 'dump',
            args: ['--archive', format, snapshotId, path],
            outputStream: stream
        })
    }

    public async getSnapshot(
        {repository, logger, abortSignal, snapshotId}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal, snapshotId: string}
    ): Promise<Snapshot> {
        await this.unlockRepository({repository, logger, abortSignal})

        const [infos, ...objects]: [ResticSnapshot, object[]] = await this.runRestic({
            repository,
            logger,
            abortSignal,
            cmd: 'ls',
            args: ['--long', snapshotId],
            outputType: 'multilineJson'
        })

        return {
            date: new Date(infos.time),
            repository: repository.name,
            backup: this.extractValueFromTags(infos.tags, 'backup'),
            job: this.extractValueFromTags(infos.tags, 'job'),
            id: snapshotId,
            device: infos.hostname,
            objects: objects.map((o: object) => ({permissions: 'unknown', ...o}))
        }
    }

    public async checkRepository(
        {repository, logger, abortSignal}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal}
    ) {
        await this.unlockRepository({repository, logger, abortSignal})

        await this.runRestic({
            cmd: 'check',
            repository,
            logger,
            abortSignal
        })
    }

    protected async unlockRepository(
        {repository, logger, abortSignal}:
        {repository: Repository, logger: Logger, abortSignal?: AbortSignal}
    ) {
        await this.runRestic({
            cmd: 'unlock',
            repository,
            logger,
            abortSignal
        })
    }

    protected async runRestic<T>(
        {cmd, args, repository, logger, device, abortSignal, outputType, backup, job, outputStream}:
        {cmd: string, args?: string[], repository: Repository, logger: Logger, device?: string, outputStream?: NodeJS.WritableStream,
         abortSignal?: AbortSignal, outputType?: ProcessConfig['outputType'], backup?: Backup, job?: string}
    ): Promise<T> {
        const cmdArgs: string[] = ['--cleanup-cache', ...args || []]

        if (outputType === 'json' || outputType === 'multilineJson') {
            cmdArgs.push('--json')
        }

        if (device) {
            cmdArgs.push('--host', device)
        }

        if (backup) {
            cmdArgs.push('--tag', this.formatTagValue('backup', backup.name))
        }

        if (job) {
            cmdArgs.push('--tag', this.formatTagValue('job', job))
        }

        const uploadLimit = repository.uploadLimit || this.config.uploadLimit
        const downloadLimit = repository.downloadLimit || this.config.downloadLimit

        if (uploadLimit) {
            cmdArgs.push('--limit-upload', sizeToKiB(uploadLimit).toString())
        }

        if (downloadLimit) {
            cmdArgs.push('--limit-download', sizeToKiB(downloadLimit).toString())
        }

        const env = {
            RESTIC_REPOSITORY: repository.location,
            RESTIC_PASSWORD: repository.password,
            ...this.getProviderEnvs(repository)
        }

        return await runProcess({
            env: {...env, RESTIC_CACHE_DIR: '/var/cache/restic'},
            logger,
            cmd,
            args: cmdArgs,
            abortSignal,
            outputType,
            killSignal: 'SIGINT',
            outputStream
        }, true)
    }

    protected getProviderEnvs(repository: Repository): Record<string, string> {
        if (!repository.provider) {
            return {}
        }

        return reduce(repository.provider.params, (providerEnvs: Record<string, string>, value: string, key: string) => {
            providerEnvs[repository.provider!.name.toUpperCase() + '_' + key.toUpperCase()] = value.toString()

            return providerEnvs
        }, {})
    }

    protected extractValueFromTags(tags: string[], key: string) {
        const tag = tags.find(tag => tag.substr(0, key.length + 1) === key + '-')

        if (!tag) {
            throw new Error('Missing key ' + key)
        }

        return tag.substr(key.length + 1)
    }

    protected formatTagValue(key: string, value: string) {
        return key + '-' + value
    }
}
