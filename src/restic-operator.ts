import { Repository, Backup } from './definitions'
import { Logger } from 'js-libs/logger'
import { runPromisedProcess, ProcessPromise } from 'js-libs/process'
import { reduce } from 'lodash'

export interface ResticOperatorConfig {
    device: string
    uploadLimit?: string
    downloadLimit?: string
}

// Link Domain with Restic, unitary
export default class ResticOperator {
    protected config: ResticOperatorConfig

    constructor(config: ResticOperatorConfig) {
        this.config = config
    }

    listRepositorySnapshots(
        {repository, logger, device, backup}:
        {repository: Repository, logger: Logger, device?: string, backup?: Backup}
    ): ProcessPromise<object> {

                    const args = ['--host', this.config.hostname]

                    if (criterias.backupName) {
                        args.push('--tag', 'backup-' + criterias.backupName)
                    }

        return runPromisedProcess({
            logger,
            cmd: 'snapshots'
            args: string[]
            cwd?: string
            env?: {[k: string]: string}
            outputStream?: NodeJS.WritableStream
            outputType?: 'text' | 'multilineText' | 'json' | 'multilineJson'
            killSignal?: NodeJS.Signals
        })

                            resticSnapshots.map(resticSnapshot => ({
                                date: resticSnapshot['time'],
                                hostname: resticSnapshot['hostname'],
                                backup: this.extractValueFromTags(resticSnapshot.tags, 'backup'),
                                job: this.extractValueFromTags(resticSnapshot.tags, 'job'),
                                repository: repositoryName,
                                id: resticSnapshot['id']
                            }))
        // const resticCall = this.restic.call(
        //     'snapshots',
        //     args,
        //     {
        //         repository: repository,
        //         logger: job.getLogger(),
        //         ..._.pick(repository, ['uploadLimit', 'downloadLimit'])
        //     }
        // )
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
}
