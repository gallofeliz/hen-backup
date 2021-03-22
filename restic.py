import subprocess, threading

class CallRescError(Exception):
    def __init__(self, result):
        self.result = result
        self.message = 'Call Restic Error'
    def get_result(self):
        return self.result

def call_restic(cmd, args = [], env={}):
    cmd_parts = ["restic"] + [cmd] + args
    logger.debug('START ' + ' '.join(cmd_parts), extra={'action': 'call_restic', 'status': 'starting'})
    proc = subprocess.Popen(
        cmd_parts,
        env={**env, RESTIC_CACHE_DIR:'/tmp'},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True
    )

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

    logger.debug('EXIT ' + str(code), extra={'action': 'call_restic', 'status': 'failure' if code else 'success'})

    result = {
        'code': code,
        'stdout': out,
        'stderr': err
    }

    if code > 0:
        raise CallResticError(result)

    return result
