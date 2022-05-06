import { Duration, durationToSeconds } from 'js-libs/utils'
import { Logger } from 'js-libs/logger'
import got, { Method } from 'got'

/** @type integer */
type integer = number

export interface HttpRequest {
   url: string
   method?: Method
   timeout?: Duration
   retries?: integer
}

export default async function httpRequest(request: HttpRequest, abortSignal: AbortSignal, logger: Logger) {
    const gotRequest = got({
        method: request.method as Method || 'GET',
        url: request.url,
        timeout: request.timeout ? durationToSeconds(request.timeout) * 1000 : undefined,
        retry: request.retries || 0,
        hooks: {
            beforeRequest: [options  => { logger.info('Calling http request ' + options.url)}],
            afterResponse: [response => { logger.info('Http Request returned code ' + response.statusCode) ; return response }],
            beforeError: [error => { logger.info('Http Request returned error ' + error.message) ; return error }]
        }
    })

    const onSignalAbort = () => gotRequest.cancel()
    abortSignal.addEventListener('abort', onSignalAbort)

    try {
        await gotRequest
    } finally {
        abortSignal.removeEventListener('abort', onSignalAbort)
    }
}
