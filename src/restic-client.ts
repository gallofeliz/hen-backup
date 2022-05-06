import { Size, sizeToKiB, Duration, durationToSeconds } from 'js-libs/utils'
import { Logger } from 'js-libs/logger'
import runProcess, { ProcessConfig } from 'js-libs/process'
import { reduce, flatten, map, omitBy, isNil } from 'lodash'

/** @type integer */
type integer = number

type ResticListTags = string[]
type ResticRecordTags = Record<string, string>

export interface ResticSnapshot {
    time: string
    hostname: string
    tags: ResticRecordTags
    id: string
    objects?: object[]
}

export interface ResticRepository { // or location { uri, type, params }
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
    tags?: ResticRecordTags
}

export interface ResticForgetPolicy {
    nbOfHourly?: integer
    nbOfdaily?: integer
    nbOfWeekly?: integer
    nbOfMonthly?: integer
    nbOfYearly?: integer
    minTime?: Duration
}

export default class ResticClient {
    public async initRepository(opts: ResticOpts) {
        await this.runRestic({
            cmd: 'init',
            ...opts
        })
    }

    public async listSnapshots(opts: ResticOpts): Promise<ResticSnapshot[]> {
        await this.unlockRepository(opts)

        const snapshots: ResticSnapshot[] = await this.runRestic({
            cmd: 'snapshots',
            outputType: 'json',
            ...opts
        })

        snapshots.forEach((snapshot) => {
            snapshot.tags = this.tagsArrayToRecord(snapshot.tags as any as ResticListTags) // todo fix
        })

        return snapshots
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
            tags: this.tagsArrayToRecord(infos.tags as any), // Todo fix
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
            repository: opts.repository,
            logger: opts.logger,
            abortSignal: opts.abortSignal,
            networkLimit: opts.networkLimit
        })
    }

    protected async runRestic<T>(
        {cmd, args, repository, logger, hostname, abortSignal, outputType, tags, outputStream, networkLimit}:
        ResticOpts & {cmd: string, args?: string[], outputStream?: NodeJS.WritableStream, outputType?: ProcessConfig['outputType']}
    ): Promise<T> {
        const cmdArgs: string[] = [cmd, '--cleanup-cache', ...args || []]

        if (outputType === 'json' || outputType === 'multilineJson') {
            cmdArgs.push('--json')
        }

        if (hostname) {
            cmdArgs.push('--host', hostname)
        }

        if (tags) {
            this.tagsRecordToArray(tags).forEach(tag => cmdArgs.push('--tag', tag))
        }

        // Don't apply limits for local disk ...
        if (networkLimit && repository.location.substr(0, 1) !== '/') {

            if (networkLimit.uploadLimit) {
                cmdArgs.push('--limit-upload', sizeToKiB(networkLimit.uploadLimit).toString())
            }

            if (networkLimit.downloadLimit) {
                cmdArgs.push('--limit-download', sizeToKiB(networkLimit.downloadLimit).toString())
            }

        }

        const env = {
            RESTIC_REPOSITORY: repository.location,
            RESTIC_PASSWORD: repository.password,
            ...this.getProviderEnvs(repository)
        }

        return await runProcess({
            env: {...env, RESTIC_CACHE_DIR: '/var/cache/restic'},
            logger,
            cmd: 'restic',
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

    public tagsArrayToRecord(tags: ResticListTags): ResticRecordTags {
        return reduce(tags, (record, stringifyed) => {
            const parsed = JSON.parse(stringifyed)
            return {
                ...record,
                [parsed[0]]: parsed[1]
            }
        }, {})
    }

    protected tagsRecordToArray(tags: ResticRecordTags): ResticListTags {
        return reduce(tags, (list, value, key) => {
            const stringifyed = JSON.stringify([key, value])
            return [
                ...list,
                stringifyed
            ]
        }, [] as ResticListTags)
    }
}
