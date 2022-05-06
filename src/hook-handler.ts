import { Duration } from 'js-libs/utils'
import { HttpRequest } from './http-requester'

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


//     protected async handleHook(hook: Hook, job: Job) {
//         if (hook.type !== 'http') {
//             throw new Error('Only http implemented')
//         }

//         const request = got({
//             method: hook.method as GotMethod || 'GET',
//             url: hook.url,
//             timeout: hook.timeout ? durationToSeconds(hook.timeout) * 1000 : undefined,
//             retry: hook.retries || 0,
//             hooks: {
//                 beforeRequest: [options  => {job.getLogger().info('Calling hook ' + options.url)}],
//                 afterResponse: [response => { job.getLogger().info('Hook returned code ' + response.statusCode) ; return response }],
//                 beforeError: [error => { job.getLogger().info('Hook returned error ' + error.message) ; return error }]
//             }
//         })

//         job.once('abort', () => request.cancel())

//         await request
//     }
