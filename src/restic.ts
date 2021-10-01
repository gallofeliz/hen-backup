import { ChildProcess, spawn } from 'child_process'
import Logger from './logger'

export default class Restic {
    protected processes: ChildProcess[] = []

    public run(command: string, args: string[], env: Record<string, string>, logger: Logger) {

        logger = logger.child('restic-' + command)

        const json = ['ls', 'snapshots'].includes(command) ? true : false
        const multilineJson = command === 'ls' ? true : false

        const resticArgs = ['--cleanup-cache', command].concat(args).concat(json ? ['--json'] : [])
        const resticEnv = {...env, 'RESTIC_CACHE_DIR':'/tmp'}

        logger.info('Starting Restic process', {
            resticArgs,
            resticEnv
        })

        spawn('restic', resticArgs, { env: resticEnv })



//     json_iterator=False # For next millenium, use iterator for big snapshots ?
//     if cmd == 'ls' and json == True:
//         json_iterator=True

//     processes.append(proc)

//     out=[] # only last to avoid memory boooom ?
//     err=[] # only last to avoid memory boooom ?

//     def log(stream, channel, stack):
//         for rline in iter(stream.readline, ''):
//             line = rline.rstrip()
//             if line:
//                 logger.info(channel + ' ' + line, extra={'component': 'restic', 'action': 'call_restic', 'subaction': 'receive_output', 'status': 'running', 'node': node})
//                 stack.append(line)
//         logger.info(channel + ' CLOSED', extra={'component': 'restic', 'action': 'call_restic', 'subaction': 'receive_output', 'status': 'success', 'node': node})


//     threading.Thread(target=log, args=(proc.stdout, 'STDOUT', out,)).start()
//     threading.Thread(target=log, args=(proc.stderr, 'STDERR', err,)).start()
//     code = proc.wait()

//     processes.remove(proc)

//     logger.info('EXIT ' + str(code), extra={'component': 'restic', 'action': 'call_restic', 'status': 'failure' if code else 'success', 'node': node})

//     if json == True and not json_iterator:
//         stdout = json_loads('\n'.join(out))
//     elif json == True:
//         stdout = []
//         for line in out:
//             stdout.append(json_loads(line))
//     else:
//         stdout = '\n'.join(out)

//     result = {
//         'code': code,
//         'stdout': stdout,
//         'stderr': '\n'.join(err)
//     }

//     if code > 0:
//         raise CallResticError(result)

//     return result


    }

    public terminateAll() {
        this.processes.forEach(process => process.kill('SIGINT'))
    }
}



