import { Size, sizeToKiB, Duration, durationToSeconds } from 'js-libs/utils'
import { Logger } from 'js-libs/logger'
import runProcess, { ProcessConfig } from 'js-libs/process'
import { reduce, flatten, map, omitBy, isNil } from 'lodash'

/** @type integer */
type integer = number

export interface ResticSnapshot {
    time: string
    hostname: string
    tags: string[]
    id: string
    objects?: object[]
}

export interface ResticRepository {
    location: string
    password: string
    provider?: {
        name: 'os' | 'aws' | 'st' | 'b2' | 'azure' | 'google' | 'rclone'
        params: Record<string, string>
    }
}

export interface ResticNetworkLimit {
    uploadLimit?: Size
    downloadLimit?: Size
}

export interface ResticOpts {
    logger: Logger
    abortSignal: AbortSignal
    repository: ResticRepository
    networkLimit?: ResticNetworkLimit
    hostname?: string
    tags?: string[]
}

export interface ResticForgetPolicy {
    nbOfHourly?: integer
    nbOfdaily?: integer
    nbOfWeekly?: integer
    nbOfMonthly?: integer
    nbOfYearly?: integer
    minTime?: Duration
}

export default class ResticOperator {
    public async initRepository(opts: ResticOpts) {
        await this.runRestic({
            cmd: 'init',
            ...opts
        })
    }

    public async listSnapshots(opts: ResticOpts): Promise<ResticSnapshot[]> {
        await this.unlockRepository(opts)

        return await this.runRestic({
            cmd: 'snapshots',
            outputType: 'json',
            ...opts
        })
    }

    public async forgetAndPrune(opts: ResticOpts & { policy: ResticForgetPolicy }) {
        await this.unlockRepository(opts)

        const retentionPolicyMapping: Record<string, string> = {
            'nbOfHourly': 'hourly',
            'nbOfdaily': 'daily',
            'nbOfWeekly': 'weekly',
            'nbOfMonthly': 'monthly',
            'nbOfYearly': 'yearly',
            'minTime': 'within'
        }

        const retentionPolicyArgs: string[] = flatten(map(omitBy(opts.policy, isNil), (retentionValue, retentionKey) => {
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
            ...opts
        })
    }

    public async backup(opts: ResticOpts & { paths: string[], excludes?: string[] }) {
        await this.unlockRepository(opts)

        await this.runRestic({
            cmd: 'backup',
            args: [
                ...opts.paths,
                ...opts.excludes ? opts.excludes.map(exclude => '--exclude=' + exclude) : []
            ],
            ...opts
        })
    }

    public async downloadSnapshot(opts: ResticOpts & { format: 'zip' | 'tar', snapshotId: string, path?: string, stream: NodeJS.WritableStream }) {
        await this.unlockRepository(opts)

        await this.runRestic({
            cmd: 'dump',
            args: ['--archive', opts.format, opts.snapshotId, opts.path || '/'],
            outputStream: opts.stream,
            ...opts
        })
    }

    public async getSnapshot(opts: ResticOpts & { snapshotId: string }): Promise<ResticSnapshot> {
        await this.unlockRepository(opts)

        const [infos, ...objects]: [ResticSnapshot, object[]] = await this.runRestic({
            cmd: 'ls',
            args: ['--long', opts.snapshotId],
            outputType: 'multilineJson',
            ...opts
        })

        return {
            ...infos,
            objects: objects
        }
    }

    public async checkRepository(opts: ResticOpts) {
        await this.unlockRepository(opts)

        await this.runRestic({
            cmd: 'check',
            ...opts
        })
    }

    protected async unlockRepository(opts: ResticOpts) {
        await this.runRestic({
            cmd: 'unlock',
            ...opts
        })
    }

    protected async runRestic<T>(
        {cmd, args, repository, logger, hostname, abortSignal, outputType, tags, outputStream, networkLimit}:
        ResticOpts & {cmd: string, args?: string[], outputStream?: NodeJS.WritableStream, outputType?: ProcessConfig['outputType']}
    ): Promise<T> {
        const cmdArgs: string[] = ['--cleanup-cache', ...args || []]

        if (outputType === 'json' || outputType === 'multilineJson') {
            cmdArgs.push('--json')
        }

        if (hostname) {
            cmdArgs.push('--host', hostname)
        }

        (tags || []).forEach(tag => cmdArgs.push('--tag', tag))

        if (networkLimit?.uploadLimit) {
            cmdArgs.push('--limit-upload', sizeToKiB(networkLimit.uploadLimit).toString())
        }

        if (networkLimit?.downloadLimit) {
            cmdArgs.push('--limit-download', sizeToKiB(networkLimit.downloadLimit).toString())
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

    protected getProviderEnvs(repository: ResticRepository): Record<string, string> {
        if (!repository.provider) {
            return {}
        }

        return reduce(repository.provider.params, (providerEnvs: Record<string, string>, value: string, key: string) => {
            providerEnvs[repository.provider!.name.toUpperCase() + '_' + key.toUpperCase()] = value.toString()

            return providerEnvs
        }, {})
    }
}
