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
import logging

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

    def check():
        self.__run('check')

    def is_init(self):
        try:
            self.__run('check', [], True)
            return True
        except CalledProcessError as e:
            if e.stderr.find('conn.Object: Object Not Found') != -1:
                return False
            raise e

    # Need to retry everytime ? Only if a network problem, etc, but I can't identify it, so for now I comment retry
    # @retry(wait_exponential_multiplier=convert_to_mseconds('5s'), wait_exponential_max=convert_to_mseconds('1m'), stop_max_attempt_number=5)
    def __run(self, cmd, args = [], capture_output = False):
        logging.debug('RESTIC START %s %s %s', cmd, 'with args', args)
        try:
            process_cmd_parts = ["restic"] + [cmd] + args
            process = subprocess.run(process_cmd_parts, capture_output=capture_output, check=True, text=True)
            logging.debug('RESTIC SUCCESS %s %s %s', process.returncode, process.stdout, process.stderr)
            return process
        except CalledProcessError as e:
            logging.debug('RESTIC ERROR %s %s %s', e.returncode, e.stdout, e.stderr)
            raise e

logging.basicConfig(level=logging.DEBUG, format='[%(levelname)s] %(message)s')
restic = Restic()
scheduler = sched.scheduler()
list_separator = ','
backup_paths = os.environ['BACKUP_PATHS'].split(list_separator)
backup_exclude = os.environ['BACKUP_EXCLUDE'].split(list_separator)
backup_schedule = convert_to_seconds(os.environ['BACKUP_SCHEDULE'])
check_schedule = convert_to_seconds(os.environ['CHECK_SCHEDULE'])

@retry(wait_fixed=convert_to_mseconds('30m'))
def init():
    try:
        logging.info('Initializing...')
        if not restic.is_init():
            restic.init()
        logging.info('Initialized !')
    except Exception as e:
        logging.exception('Init error, will retry later')
        raise e

def schedule():
    backup()
    scheduler.enter(check_schedule, 1, check)
    scheduler.run()

@retry(wait_fixed=convert_to_mseconds('30m'))
def check():
    try:
        logging.info('Checking...')
        restic.check()
        logging.info('Check done !')
        scheduler.enter(check_schedule, 1, check)
    except Exception as e:
        logging.exception('Check error, will retry later')
        raise e

@retry(wait_fixed=convert_to_mseconds('30m'))
def backup():
    try:
        logging.info('Backuping...')
        restic.backup(backup_paths, excludes=backup_exclude)
        logging.info('Backup done !')
        scheduler.enter(backup_schedule, 1, backup)
    except Exception as e:
        logging.exception('Backup error, will retry later')
        raise e

init()
schedule()
