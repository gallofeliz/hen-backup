#!/usr/bin/env python

import subprocess
from subprocess import CalledProcessError
from retrying import retry
import time
from time import sleep
import sched
import os
from shlex import quote
import requests
import threading

class Restic():

    def init(self):
        self.__run('init')

    def backup(self, paths, excludes = []):
        args = paths + map(lambda exclude : '--exclude=' + quote(exclude), excludes)
        self.__run('backup', args)

    def is_init(self):
        try:
            self.__run('check', [], True)
            return True
        except CalledProcessError as e:
            print(e.stderr)
            if e.stderr.find('conn.Object: Object Not Found') != -1:
                return False
            raise e

    def __run(self, cmd, args = [], capture_output = False):
        print('RESTIC START', cmd, 'with args', args)
        try:
            process_cmd_parts = ["restic"] + [cmd] + args
            process = subprocess.run(process_cmd_parts, capture_output=capture_output, check=True, text=True)
            print('RESTIC SUCCESS', process.returncode, process.stdout, process.stderr)
            return process
        except CalledProcessError as e:
            print('RESTIC ERROR', e.returncode, e.stdout, e.stderr)
            raise e

restic = Restic()
scheduler = sched.scheduler()
list_separator = ','
backup_paths = os.environ['BACKUP_PATHS'].split(list_separator)
backup_exclude = os.environ['BACKUP_EXCLUDE'].split(list_separator)
backup_schedule = int(os.environ['BACKUP_SCHEDULE'])
notify_url = os.environ['NOTIF_URL']

# for the moment only success
# notify async (idea)
def anotify(event_name):
    event = {
        'ts': round(time.time()),
        'event': event_name
    }
    threading.Thread(target=notif, args=(event,)).start()

@retry(wait_exponential_multiplier=1000, wait_exponential_max=300000, stop_max_attempt_number=30)
def notif(event):
    print('Notifying', event)
    requests.post(notify_url, data = event)

@retry(wait_exponential_multiplier=5000, wait_exponential_max=3600000)
def init():
    try:
        print('Initializing')
        if not restic.is_init():
            restic.init()
        print('Ready')
    except Exception as e:
        print('Init error', e)
        anotify('error')
        raise e

@retry(wait_exponential_multiplier=5000, wait_exponential_max=3600000)
def backup():
    try:
        print('Backuping')
        restic.backup(backup_paths, excludes=backup_exclude)
        print('Backup done !')
        scheduler.enter(backup_schedule, 1, backup)
        anotify('backup-done')
    except Exception as e:
        print('Backup error', e)
        anotify('error')
        raise e

init()
backup()
scheduler.run()
