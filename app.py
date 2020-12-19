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

seconds_per_unit = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}

def convert_to_seconds(duration):
    return int(duration[:-1]) * seconds_per_unit[duration[-1]]

def convert_to_mseconds(duration):
    return convert_to_seconds(duration) * 1000

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

    @retry(wait_exponential_multiplier=convert_to_mseconds('5s'), wait_exponential_max=convert_to_mseconds('1m'), stop_max_attempt_number=5)
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

class Notifier():
    def notify(self, event_name):
        event = {
            'ts': round(time.time()),
            'event': event_name
        }
        threading.Thread(target=self.do_notify, args=(event,)).start()

    @retry(wait_exponential_multiplier=convert_to_mseconds('1s'), wait_exponential_max=convert_to_mseconds('5m'), stop_max_attempt_number=30)
    def do_notify(self, event):
        print('Notifying', event)
        requests.post(notify_url, json=event)

restic = Restic()
notifier = Notifier()
scheduler = sched.scheduler()
list_separator = ','
backup_paths = os.environ['BACKUP_PATHS'].split(list_separator)
backup_exclude = os.environ['BACKUP_EXCLUDE'].split(list_separator)
backup_schedule = convert_to_seconds(os.environ['BACKUP_SCHEDULE'])
notify_url = os.environ['NOTIF_URL']

@retry(wait_fixed=convert_to_mseconds('30m'))
def init():
    try:
        print('Initializing')
        if not restic.is_init():
            restic.init()
        print('Ready')
    except Exception as e:
        print('Init error, will retry later', e)
        notifier.notify('error')
        raise e

def schedule_backups():
    backup()
    scheduler.run()

@retry(wait_fixed=convert_to_mseconds('30m'))
def _backup():
    try:
        print('Backuping')
        restic.backup(backup_paths, excludes=backup_exclude)
        print('Backup done !')
        scheduler.enter(backup_schedule, 1, backup)
        notifier.notify('backup-done')
    except Exception as e:
        print('Backup error, will retry later', e)
        notifier.notify('error')
        raise e

init()
schedule_backups()
