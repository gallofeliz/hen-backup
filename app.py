#!/usr/bin/env python

import subprocess
from subprocess import CalledProcessError
from time import sleep
import sched
import os

class Restic():

    def init(self):
        self.__run('init')

    def backup(self, paths):
        self.__run('backup', paths)

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
backup_paths = os.environ['BACKUP_PATHS']

def init():
    while True:
        try:
            print('Initializing')
            if not restic.is_init():
                restic.init()
            print('Ready')
            break
        except Exception as e:
            print('Init error', e)
            print('Waiting before retry')
            sleep(60)

def backup():
    try:
        print('Backuping')
        restic.backup(backup_paths.split(':'))
        print('Backup done !')
        scheduler.enter(60 * 60 * 12, 1, backup)
    except Exception as e:
        print('Backup error', e)
        print('Waiting before retry')
        scheduler.enter(60, 1, backup)

init()
backup()
scheduler.run()
