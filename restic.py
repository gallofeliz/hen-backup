import subprocess, threading, signal
from json import loads as json_loads

processes = []

class CallResticError(Exception):
    def __init__(self, result):
        self.result = result
        self.message = 'Call Restic Error'
    def get_result(self):
        return self.result

def kill_all_restics():
    for process in processes:
        process.send_signal(signal.SIGINT)

def call_restic(cmd, args, env, logger, json=False):
    cmd_parts = ["restic"] + [cmd] + args + (['--json'] if json else [])
    env = {**env, 'RESTIC_CACHE_DIR':'/tmp'}
    logger.info('START ' + ' '.join(cmd_parts) + ' with env ' + str(env), extra={'component': 'restic', 'action': 'call_restic', 'status': 'starting'})
    proc = subprocess.Popen(
        cmd_parts,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True
    )

    processes.append(proc)

    out=[] # only last to avoid memory boooom ?
    err=[] # only last to avoid memory boooom ?

    def log(stream, channel, stack):
        for rline in iter(stream.readline, ''):
            line = rline.rstrip()
            if line:
                logger.info(channel + ' ' + line, extra={'component': 'restic', 'action': 'call_restic', 'status': 'running'})
                stack.append(line)


    threading.Thread(target=log, args=(proc.stdout, 'STDOUT', out,)).start()
    threading.Thread(target=log, args=(proc.stderr, 'STDERR', err,)).start()
    code = proc.wait()

    processes.remove(proc)

    logger.info('EXIT ' + str(code), extra={'component': 'restic', 'action': 'call_restic', 'status': 'failure' if code else 'success'})

    result = {
        'code': code,
        'stdout': json_loads('\n'.join(out)) if json else '\n'.join(out),
        'stderr': '\n'.join(err)
    }

    if code > 0:
        raise CallResticError(result)

    return result
