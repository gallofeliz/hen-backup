import { Duration } from 'js-libs/utils'
import httpRequest, { HttpRequest } from './http-request'
import { Logger } from 'js-libs/logger'

// function isHttpHook(hook: Hook): hook is HttpHook {
//     return hook.type === 'http'
// }

/** @type integer */
type integer = number

interface BaseHook {
    timeout?: Duration
    retries?: integer
    onfailure?: 'continue' | 'stop' | 'ignore'
}

interface HttpHook extends BaseHook, HttpRequest {
    type: 'http'
}

export type Hook = HttpHook

export default async function handleHook(hook: Hook, abortSignal: AbortSignal, logger: Logger) {
    if (abortSignal.aborted) {
        throw new Error('Aborted Hook')
    }

    return httpRequest(hook, abortSignal, logger)
}
