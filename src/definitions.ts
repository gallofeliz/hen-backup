import { Size, Duration } from 'js-libs/utils'
import { Priority } from 'js-libs/jobs'
import { Method } from 'got'
import { LogLevel } from 'js-libs/logger'

/** @type integer */
type integer = number

interface BaseHook {
    timeout?: Duration
    retries?: integer
    onfailure?: 'continue' | 'stop' | 'ignore'
}

interface HttpRequest {
   url: string
   method: Method
   timeout?: Duration
   retries?: integer
}

interface HttpHook extends BaseHook, HttpRequest {
    type: 'http'
}

type Hook = HttpHook

interface BaseStat {
    shareName?: string
}

interface BaseBillingStat {
    currency: string
}

interface HttpSizeStatFetch extends BaseStat, HttpRequest {
    type: 'http'
}

interface HttpBillingStatFetch extends BaseStat, HttpRequest, BaseBillingStat {
    type: 'http'
}

type SizeStatFetch = HttpSizeStatFetch
type BillingStatFetch = HttpBillingStatFetch

interface Repository {
    name: string
    location: string
    password: string
    uploadLimit?: Size
    downloadLimit?: Size
    providerEnv: Record<string, string>
    check: {
        schedules?: Duration[]
        priority?: Priority
    }
    usageStats?: {
        size?: SizeStatFetch
        billing?: BillingStatFetch
    }
}

interface Backup {
    name: string
    repositories: string[]
    paths: string[]
    excludes?: string[]
    schedules?: Duration[]
    priority: Priority
    watch?: {
        wait?: {
            min: Duration
            max: Duration
        }
    }
    prune?: {
        schedules?: Duration[]
        priority: Priority
        retentionPolicy: {
            nbOfHourly?: integer
            nbOfdaily?: integer
            nbOfWeekly?: integer
            nbOfMonthly?: integer
            nbOfYearly?: integer
            minTime?: Duration
        }
    },
    hooks?: {
        before?: Hook
    }
}

// function isHttpHook(hook: Hook): hook is HttpHook {
//     return hook.type === 'http'
// }

interface AppConfig {
    hostname: string
    uploadLimit?: Size
    downloadLimit?: Size
    log: {
        level: LogLevel
    }
    api: {
        port: integer
        users?: Array<{
            username: string
            password: string
        }>
    }
    repositories: Record<string, Repository>
    backups: Record<string, Backup>
}

// ts-json-schema-generator --path src/definitions.ts --type UserProvidedAppConfig
export interface UserProvidedAppConfig {
    hostname?: string
    uploadLimit?: Size
    downloadLimit?: Size
    log?: {
        level?: LogLevel
    }
    api?: {
        port?: integer
        users?: Array<{
            username: string
            password: string
        }>
    }
    repositories: Record<string, Repository>
    backups: Record<string, Omit<Backup, 'repositories'> & {
        repositories: Array<Repository | string>
    }>
    repositoriesSharedStats?: {
        size?: Record<string, SizeStatFetch>
        billing?: Record<string, BillingStatFetch>
    }
}
