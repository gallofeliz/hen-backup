import { Size, Duration } from 'js-libs/utils'
import { Priority } from 'js-libs/jobs'
import { Schedule } from 'js-libs/fn-scheduler'
import { Method } from 'got'
import { LogLevel } from 'js-libs/logger'
import { ResticForgetPolicy, ResticRepository } from './restic-client'

/** @type integer */
type integer = number

interface BaseHook {
    timeout?: Duration
    retries?: integer
    onfailure?: 'continue' | 'stop' | 'ignore'
}

interface HttpRequest {
   url: string
   method?: Method
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


export interface Repository extends ResticRepository {
    name: string
    check?: {
        schedules?: Schedule[]
        priority?: Priority
    }
    usageStats?: {
        size?: SizeStatFetch
        billing?: BillingStatFetch
    }
}

export interface Backup {
    name: string
    repositories: string[]
    paths: string[]
    excludes?: string[]
    schedules?: Schedule[]
    priority?: Priority
    watch?: {
        wait?: {
            min: Duration
            max: Duration
        }
    }
    prune?: {
        schedules?: Schedule[]
        priority?: Priority
        retentionPolicy: ResticForgetPolicy
    },
    hooks?: {
        before?: Hook
    }
}

export interface Snapshot {
    date: Date,
    device: string,
    backup: string,
    job: string,
    repository: string,
    id: string
    objects?: object[]
}

// function isHttpHook(hook: Hook): hook is HttpHook {
//     return hook.type === 'http'
// }

export interface ApiConfig {
    port: integer
    users?: Array<{
        username: string
        password: string
    }>
}

export interface LogConfig {
    level: LogLevel
}

export interface AppConfig {
    device: string
    uploadLimit?: Size
    downloadLimit?: Size
    log: LogConfig
    api: ApiConfig
    repositories: Record<string, Repository>
    backups: Record<string, Backup>
}

// ts-json-schema-generator --path src/definitions.ts --type UserProvidedAppConfig
export interface UserProvidedAppConfig {
    device?: string
    uploadLimit?: Size
    downloadLimit?: Size
    log?: Partial<LogConfig>
    api?: Partial<ApiConfig>
    repositories?: Record<string, Omit<Repository, 'name'>>
    backups: Record<string, Omit<Backup, 'repositories' | 'name'> & {
        repositories: Array<Repository | string> | Record<string, Omit<Repository, 'name'>>
    }>
    repositoriesSharedStats?: {
        size?: Record<string, SizeStatFetch>
        billing?: Record<string, BillingStatFetch>
    }
}

