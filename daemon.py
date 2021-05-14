import rpyc
import threading
from restic import kill_all_restics, call_restic
from gallocloud_utils.scheduling import schedule, create_scheduler
from gallocloud_utils.convertions import convert_to_seconds, convert_to_KiB
from gallocloud_utils.fswatcher import create_fswatch_callback
from gallocloud_utils.tasks import Task, TaskManager
from shlex import quote
import requests
from retrying import retry
from glom import glom

class Daemon(rpyc.Service):
    def __init__(self, config, logger):
        self._config = config
        self._logger = logger
        self._started = False
        self._task_manager = TaskManager(self._logger)
        self._rpc = rpyc.ThreadedServer(service=self, port=18812, protocol_config={'allow_all_attrs': True, "allow_public_attrs":True})
        self._schedules = []
        self._fswatchers = []

    def start(self):
        if self._started:
            return

        self._logger.info('Starting Daemon', extra={
            'component': 'daemon',
            'action': 'start',
            'status': 'starting'
        })

        self._task_manager.run()
        threading.Thread(target=self._rpc.start).start()

        scheduler = create_scheduler()
        config = self._config

        for repository_name in config['repositories']:
            repository = config['repositories'][repository_name]
            self.init_repository(repository_name)

            if 'check' in repository:
                self._schedules.append(
                    schedule(
                        repository['check']['schedules'],
                        self.check_repository,
                        kwargs={
                            'repository_name': repository_name
                        },
                        runAtBegin=True,
                        scheduler=scheduler,
                        on_error=self._logger.exception
                    )
                )

            for backup_name in config['backups']:
                backup = config['backups'][backup_name]

                if backup.get('schedules'):
                    self._schedules.append(
                        schedule(
                            backup['schedules'],
                            self.backup,
                            kwargs={
                                'backup_name': backup_name
                            },
                            runAtBegin=True,
                            scheduler=scheduler,
                            on_error=self._logger.exception
                        )
                    )

                if backup['watch']:
                    self._fswatchers.append(
                        create_fswatch_callback(**{
                            'paths':backup['paths'],
                            'ignore':backup['excludes'],
                            'fn': self.backup,
                            'kwargs': {
                                'backup_name': backup_name
                            },
                            'logger': self._logger,
                            'on_error': self._logger.exception,
                            **({
                                'wait_min': convert_to_seconds(backup['watch']['wait']['min']),
                                'wait_max': convert_to_seconds(backup['watch']['wait']['max'])
                            } if type(backup['watch']) is not bool and backup['watch'].get('wait') else {})
                        })
                    )

        scheduler.run()

    def stop(self):
        if not self._started:
            return

        self._task_manager.stop()
        kill_all_restics()
        self._rpc.close()

        for schedule_stop in self._schedules:
            schedule_stop()

    def list_snapshots(self, repository_name, hostname, backup_name, priority='immediate'):
        self._logger.info('list_snapshots requested', extra={
            'component': 'daemon',
            'action': 'list_snapshots',
            'status': 'queuing'
        })

        def do_list_snapshots():
            self._logger.info('list_snapshots starting', extra={
                'component': 'daemon',
                'action': 'list_snapshots',
                'status': 'starting'
            })

            try:
                args=self._get_restic_global_opts()
                if backup_name:
                    args = args + ['--tag', 'backup-' + backup_name]
                if hostname:
                    args = args + ['--host', hostname]
                response = call_restic(cmd='snapshots', args=args, env=self._get_restic_repository_envs(self._config['repositories'][repository_name]), logger=self._logger, json=True)
                restic_snapshots = response['stdout']
                snapshots = []

                for raw_snapshot in restic_snapshots:
                    _backup_name = None
                    for tag in raw_snapshot['tags']:
                        if tag[0:7] == 'backup-':
                            _backup_name = tag[7:]
                    snapshots.append({
                        'Date': raw_snapshot['time'],
                        'Id': raw_snapshot['id'],
                        'Hostname': raw_snapshot['hostname'],
                        'Backup': _backup_name
                    })

                self._logger.info('list_snapshots success', extra={
                    'component': 'daemon',
                    'action': 'list_snapshots',
                    'status': 'success'
                })

                return snapshots
            except Exception as e:
                self._logger.info('list_snapshots failed', extra={
                    'component': 'daemon',
                    'action': 'list_snapshots',
                    'status': 'failure'
                })

                raise e

        return self._task_manager.add_task(
            task=Task(fn=do_list_snapshots, priority=priority),
            ignore_if_duplicate=False,
            get_result=True
        )

    def init_repository(self, repository_name, priority='next'):
        repository = self._config['repositories'][repository_name]

        self._logger.info('init_repository requested', extra={
            'component': 'daemon',
            'action': 'init_repository',
            'repository': repository['name'],
            'status': 'queuing'
        })

        def do_init_repository():
            self._logger.info('Starting repository initialization', extra={
                'component': 'daemon',
                'action': 'init_repository',
                'repository': repository['name'],
                'status': 'starting'
            })

            try:
                call_restic(cmd='init', args=self._get_restic_global_opts(), env=self._get_restic_repository_envs(repository), logger=self._logger)
                self._logger.info('Initialization ended :)', extra={
                    'component': 'daemon',
                    'action': 'init_repository',
                    'repository': repository['name'],
                    'status': 'success'
                })
            except Exception as e:
                self._logger.info('Unable to init ; probably already init else error ('+str(e)+')', extra={
                    'component': 'daemon',
                    'action': 'init_repository',
                    'repository': repository['name'],
                    'status': 'failure'
                })

        return self._task_manager.add_task(
            task=Task(fn=do_init_repository, priority=priority),
            ignore_if_duplicate=True,
            get_result=False
        )

    def check_repository(self, repository_name, priority=None):
        repository = self._config['repositories'][repository_name]

        self._logger.info('check_repository requested', extra={
            'component': 'daemon',
            'action': 'check_repository',
            'repository': repository['name'],
            'status': 'queuing'
        })

        if not priority:
            priority = repository.get('check', {}).get('priority', 'normal')

        def do_check_repository():
            self._logger.info('Starting check', extra={
                'component': 'daemon',
                'action': 'check_repository',
                'repository': repository['name'],
                'status': 'starting'
            })
            try:
                call_restic(cmd='check', args=self._get_restic_global_opts(), env=self._get_restic_repository_envs(repository), logger=self._logger)
                self._logger.info('Check ended :)', extra={
                    'component': 'daemon',
                    'action': 'check_repository',
                    'repository': repository['name'],
                    'status': 'success'
                })
            except Exception as e:
                self._logger.exception('Check failed :(', extra={
                    'component': 'daemon',
                    'action': 'check_repository',
                    'repository': repository['name'],
                    'status': 'failure'
                })

        self._task_manager.add_task(
            task=Task(fn=do_check_repository, priority=priority),
            ignore_if_duplicate=True,
            get_result=False
        )

    def restore_snapshot(self, repository_name, snapshot, target_path=None, priority='normal', get_result=False):
        if not target_path:
            target_path = '/'

        repository = self._config['repositories'][repository_name]

        self._logger.info('restore_snapshot requested', extra={
            'component': 'daemon',
            'action': 'restore_snapshot',
            'repository': repository['name'],
            'snapshot': snapshot,
            'status': 'queuing'
        })

        def do_restore_snapshot():
            self._logger.info('Starting restore', extra={
                'component': 'daemon',
                'action': 'restore_snapshot',
                'repository': repository_name,
                'snapshot': snapshot,
                'status': 'starting'
            })
            try:
                args = [snapshot]
                args = args + ['--target', target_path]
                args = args + self._get_restic_global_opts()
                call_restic(cmd='restore', args=args, env=self._get_restic_repository_envs(repository), logger=self._logger)
                self._logger.info('Restore ended', extra={
                    'component': 'daemon',
                    'action': 'restore_snapshot',
                    'repository': repository_name,
                    'snapshot': snapshot,
                    'status': 'success'
                })
            except Exception as e:
                self._logger.exception('Restore failed', extra={
                    'component': 'daemon',
                    'action': 'restore_snapshot',
                    'repository': repository_name,
                    'snapshot': snapshot,
                    'status': 'failure'
                })

        self._task_manager.add_task(
            task=Task(fn=do_restore_snapshot, priority=priority),
            ignore_if_duplicate=True,
            get_result=False
        )

    def _hook(self, hook):
        if hook['type'] != 'http':
            raise Exception('Only http implemented')

        print(hook)

        @retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_attempt_number=hook['retries'])
        def do_hook():
            response = requests.post(
                hook['url'],
                timeout=convert_to_seconds(hook['timeout']) if 'timeout' in hook else None
            )

            response.raise_for_status()

        do_hook()

    def backup(self, backup_name, priority=None):
        backup = self._config['backups'][backup_name]

        self._logger.info('backup requested', extra={
            'component': 'daemon',
            'action': 'backup',
            'backup': backup['name'],
            'status': 'queuing'
        })

        if not priority:
            priority = backup.get('priority', 'normal')

        def do_backup():
            self._logger.info('Starting backup', extra={
                'component': 'daemon',
                'action': 'backup',
                'backup': backup['name'],
                'status': 'starting'
            })

            hook = glom(backup, 'hooks.before', default=None)
            hook_ok = True
            if hook:
                # Should be good subaction ?
                self._logger.info('Starting backup before hook', extra={
                    'component': 'daemon',
                    'action': 'backup',
                    'subaction': 'run_hook',
                    'backup': backup['name'],
                    'hook': 'before',
                    'status': 'starting'
                })

                try:
                    self._hook(hook)

                    self._logger.info('Success backup before hook', extra={
                        'component': 'daemon',
                        'action': 'backup',
                        'subaction': 'run_hook',
                        'backup': backup['name'],
                        'hook': 'before',
                        'status': 'sucess'
                    })

                except Exception as e:
                    self._logger.exception('Failure backup before hook', extra={
                        'component': 'daemon',
                        'action': 'backup',
                        'subaction': 'run_hook',
                        'backup': backup['name'],
                        'hook': 'before',
                        'status': 'failure'
                    })

                    if hook['onfailure'] == 'stop':
                        self._logger.error('Backup failed (before hook failed) :(', extra={
                            'component': 'daemon',
                            'action': 'backup',
                            'backup': backup['name'],
                            'status': 'failure'
                        })
                        return

                    if not hook['onfailure'] == 'ignore':
                        hook_ok = False

            all_repo_ok = True
            for repository_name in backup['repositories']:
                repository = self._config['repositories'][repository_name]
                self._logger.info('Starting backup on repository', extra={
                    'component': 'daemon',
                    'action': 'backup',
                    'subaction': 'backup_repository',
                    'backup': backup['name'],
                    'repository': repository['name'],
                    'status': 'starting'
                })
                try:
                    options = ['--tag', quote('backup-' + backup['name']), '--host', self._config['hostname']] + self._get_restic_global_opts(backup)
                    args = backup['paths'] + list(map(lambda exclude : '--exclude=' + quote(exclude), backup.get('excludes', [])))
                    call_restic(cmd='backup', args=options + args, env=self._get_restic_repository_envs(repository), logger=self._logger)
                    self._logger.info('Backup on repository ended :)', extra={
                        'component': 'daemon',
                        'action': 'backup',
                        'subaction': 'backup_repository',
                        'backup': backup['name'],
                        'repository': repository['name'],
                        'status': 'success'
                    })
                except Exception as e:
                    self._logger.exception('Backup on repository failed :(', extra={
                        'component': 'daemon',
                        'subaction': 'backup_repository',
                        'action': 'backup',
                        'backup': backup['name'],
                        'repository': repository['name'],
                        'status': 'failure'
                    })
                    all_repo_ok = False

            if all_repo_ok and hook_ok:
                self._logger.info('Backup ended :)', extra={
                    'component': 'daemon',
                    'action': 'backup',
                    'backup': backup['name'],
                    'status': 'success'
                })
            else:
                self._logger.error('Backup failed (hook or backup in repository failed) :(', extra={
                    'component': 'daemon',
                    'action': 'backup',
                    'backup': backup['name'],
                    'status': 'failure'
                })

        self._task_manager.add_task(
            task=Task(fn=do_backup, priority=priority),
            ignore_if_duplicate=True,
            get_result=False
        )


    def _get_restic_repository_envs(self, repository):
        return {
            'RESTIC_REPOSITORY': repository['location'],
            'RESTIC_PASSWORD': repository['password'],
            **repository['providerEnv']
        }

    def _get_restic_global_opts(self, overrides = {}):
        options = []
        config = self._config

        uploadlimit = overrides.get('uploadLimit', config.get('uploadLimit'))
        downloadlimit = overrides.get('downloadLimit', config.get('downloadLimit'))

        if uploadlimit and uploadlimit != 'None':
            options.extend(['--limit-upload', str(convert_to_KiB(uploadlimit))])
        if downloadlimit and uploadlimit != 'None':
            options.extend(['--limit-download', str(convert_to_KiB(downloadlimit))])
        return options

