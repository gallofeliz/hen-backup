import subprocess, threading, signal
from json import loads as json_loads
from treenodes import TreeNode

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

def call_restic(cmd, args, env, logger, json=False, caller_node=None):
    if caller_node:
        node = caller_node.extends('restic-%s' % cmd)
    else:
        node = TreeNode('restic-%s' % cmd)
    cmd_parts = ["restic"] + [cmd] + args + (['--json'] if json else [])
    env = {**env, 'RESTIC_CACHE_DIR':'/tmp'}
    logger.info('START ' + ' '.join(cmd_parts) + ' with env ' + str(env), extra={'component': 'restic', 'action': 'call_restic', 'status': 'starting', 'node': node})
    proc = subprocess.Popen(
        cmd_parts,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True
    )

    json_iterator=False # For next millenium, use iterator for big snapshots ?
    if cmd == 'ls' and json == True:
        json_iterator=True

    processes.append(proc)

    out=[] # only last to avoid memory boooom ?
    err=[] # only last to avoid memory boooom ?

    def log(stream, channel, stack):
        for rline in iter(stream.readline, ''):
            line = rline.rstrip()
            if line:
                logger.info(channel + ' ' + line, extra={'component': 'restic', 'action': 'call_restic', 'subaction': 'receive_output', 'status': 'running', 'node': node})
                stack.append(line)
        logger.info(channel + ' CLOSED', extra={'component': 'restic', 'action': 'call_restic', 'subaction': 'receive_output', 'status': 'success', 'node': node})


    threading.Thread(target=log, args=(proc.stdout, 'STDOUT', out,)).start()
    threading.Thread(target=log, args=(proc.stderr, 'STDERR', err,)).start()
    code = proc.wait()

    processes.remove(proc)

    logger.info('EXIT ' + str(code), extra={'component': 'restic', 'action': 'call_restic', 'status': 'failure' if code else 'success', 'node': node})

    if json == True and not json_iterator:
        stdout = json_loads('\n'.join(out))
    elif json == True:
        stdout = []
        for line in out:
            stdout.append(json_loads(line))
    else:
        stdout = '\n'.join(out)

    result = {
        'code': code,
        'stdout': stdout,
        'stderr': '\n'.join(err)
    }

    if code > 0:
        raise CallResticError(result)

    return result
