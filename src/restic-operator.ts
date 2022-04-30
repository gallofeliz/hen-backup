import { Repository, Backup, Snapshot } from './definitions'
import { Logger } from 'js-libs/logger'
import runProcess, { ProcessConfig } from 'js-libs/process'
import { reduce } from 'lodash'
import { sizeToKiB } from 'js-libs/utils'

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

    public async listRepositorySnapshots(
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
        {cmd, args, repository, logger, device, abortSignal, outputType, backup}:
        {cmd: string, args?: string[], repository: Repository, logger: Logger, device?: string, abortSignal?: AbortSignal, outputType?: ProcessConfig['outputType'], backup?: Backup}
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
            killSignal: 'SIGINT'
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
