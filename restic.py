import subprocess, threading, signal

state = {}

class CallResticError(Exception):
    def __init__(self, result):
        self.result = result
        self.message = 'Call Restic Error'
    def get_result(self):
        return self.result

def kill_restic():
    if state['proc']:
        # shitty code but works
        state['proc'].send_signal(signal.SIGINT)

def call_restic(cmd, args, env, logger):
    cmd_parts = ["restic"] + [cmd] + args
    env = {**env, 'RESTIC_CACHE_DIR':'/tmp'}
    logger.debug('START ' + ' '.join(cmd_parts) + ' with env ' + str(env), extra={'action': 'call_restic', 'status': 'starting'})
    proc = subprocess.Popen(
        cmd_parts,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True
    )

    state['proc'] = proc

    out=[] # only last to avoid memory boooom ?
    err=[] # only last to avoid memory boooom ?

    def log(stream, channel, stack):
        for rline in iter(stream.readline, ''):
            line = rline.rstrip()
            if line:
                logger.debug(channel + ' ' + line, extra={'action': 'call_restic', 'status': 'running'})
                stack.append(line)


    threading.Thread(target=log, args=(proc.stdout, 'STDOUT', out,)).start()
    threading.Thread(target=log, args=(proc.stderr, 'STDERR', err,)).start()
    code = proc.wait()

    state['proc'] = None

    logger.debug('EXIT ' + str(code), extra={'action': 'call_restic', 'status': 'failure' if code else 'success'})

    result = {
        'code': code,
        'stdout': out,
        'stderr': err
    }

    if code > 0:
        raise CallResticError(result)

    return result
