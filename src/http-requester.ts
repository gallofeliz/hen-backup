import { Method } from 'got'
import { Duration } from 'js-libs/utils'

/** @type integer */
type integer = number

export interface HttpRequest {
   url: string
   method?: Method
   timeout?: Duration
   retries?: integer
}
