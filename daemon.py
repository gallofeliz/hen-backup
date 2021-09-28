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
from http_handler import HttpServer
from treenodes import TreeNode

class Daemon:
    def __init__(self, config, logger):
        self._config = config
        self._logger = logger
        self._started = False
        self._task_manager = TaskManager(self._logger)
        self._schedules = []
        self._fswatchers = []

        if 'api' in self._config:
            self._http_server = HttpServer(
                service=self,
                method_names=[
                    'get_config_summary',
                    'list_snapshots',
                    'explain_snapshot'
                ],
                port=self._config['api']['port'],
                logger=self._logger,
                credentials=self._config['api']['credentials']
            )

    def start(self):
        if self._started:
            return

        self._started = True

        self._logger.info('Starting Daemon', extra={
            'component': 'daemon',
            'action': 'start',
            'status': 'starting'
        })

        self._task_manager.run()

        if self._http_server:
            threading.Thread(target=self._http_server.start).start()

        scheduler = create_scheduler()
        config = self._config

        for repository_name in config['repositories']:
            repository = config['repositories'][repository_name]
            self.init_repository(repository_name)

            if 'check' in repository and 'schedules' in repository['check']:
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
                            'backup_name': backup_name,
                            'caller_node': TreeNode('Daemon-schedule')
                        },
                        runAtBegin=True,
                        scheduler=scheduler,
                        on_error=self._logger.exception
                    )
                )

            if backup.get('watch'):
                self._fswatchers.append(
                    create_fswatch_callback(**{
                        'paths':backup['paths'],
                        'ignore':backup.get('excludes', []),
                        'fn': self.backup,
                        'kwargs': {
                            'backup_name': backup_name,
                            'caller_node': TreeNode('Daemon-watch')
                        },
                        'logger': self._logger,
                        'on_error': self._logger.exception,
                        **({
                            'wait_min': convert_to_seconds(backup['watch']['wait']['min']),
                            'wait_max': convert_to_seconds(backup['watch']['wait']['max'])
                        } if type(backup['watch']) is not bool and backup['watch'].get('wait') else {})
                    })
                )

            if backup.get('prune') and 'schedules' in backup['prune']:
                self._schedules.append(
                    schedule(
                        backup['prune']['schedules'],
                        self.prune,
                        kwargs={
                            'backup_name': backup_name,
                        },
                        runAtBegin=False,
                        scheduler=scheduler,
                        on_error=self._logger.exception
                    )
                )

        scheduler.run()

    def stop(self):
        if not self._started:
            return

        self._task_manager.stop()
        kill_all_restics()

        if self._http_server:
            self._http_server.stop()

        for schedule_stop in self._schedules:
            schedule_stop()

    def get_config_summary(self):
        summary = {
            'hostname': self._config['hostname'],
            'repositories': {},
            'backups': {}
        }

        for repository_name in self._config['repositories']:
            summary['repositories'][repository_name] = {}

        for backup_name in self._config['backups']:
            backup = self._config['backups'][backup_name]
            summary['backups'][backup_name] = {
                'repositories': backup['repositories']
            }

        return summary

    def list_snapshots(self, repository_name=None, backup_name=None, priority='immediate', sort='Date', reverse=False):
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
                args = args + ['--host', self._config['hostname']]

                if repository_name:
                    reponames_lookup = [repository_name]
                elif backup_name:
                    reponames_lookup = self._config['backups'][backup_name]['repositories']
                else:
                    reponames_lookup = self._config['repositories'].keys()

                snapshots = []
                for repo_name in reponames_lookup:
                    repository = self._config['repositories'][repo_name]
                    self._unlock_repository(repository)
                    response = call_restic(
                        cmd='snapshots',
                        args=args,
                        env=self._get_restic_repository_envs(repository),
                        logger=self._logger,
                        json=True
                    )
                    restic_snapshots = response['stdout']

                    for raw_snapshot in restic_snapshots:
                        _backup_name = None
                        for tag in raw_snapshot['tags']:
                            if tag[0:7] == 'backup-':
                                _backup_name = tag[7:]
                        snapshots.append({
                            'Date': raw_snapshot['time'],
                            'Hostname': raw_snapshot['hostname'],
                            'Backup': _backup_name,
                            'Repository': repo_name,
                            'Id': raw_snapshot['id']
                        })

                self._logger.info('list_snapshots success', extra={
                    'component': 'daemon',
                    'action': 'list_snapshots',
                    'status': 'success'
                })

                return sorted(snapshots, key=lambda snapshot: snapshot[sort], reverse=reverse)
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

    def explain_snapshot(self, repository_name, snapshot_id, priority='immediate'):
        repository = self._config['repositories'][repository_name]

        response = call_restic(
                        cmd='ls',
                        args=['--long', snapshot_id],
                        env=self._get_restic_repository_envs(repository),
                        logger=self._logger,
                        json=True
                    )['stdout']

        objects = response[1:]
        tags = response[0]['tags']
        backup_name = None

        for tag in tags:
            if tag[0:7] == 'backup-':
                backup_name = tag[7:]


        for obj in objects:
            obj['permissions'] = 'unknown'

        return {
            'repository_name': repository_name,
            'backup_name': backup_name,
            'snapshot_id': snapshot_id,
            'objects': objects
        }

    def get_path_history(self, repository_name, backup_name, path, priority='immediate'):
        #sudo RESTIC_REPOSITORY=test/repositories/app2 RESTIC_PASSWORD= restic find --long '/sources/.truc/.machin/super.txt' --json --tag backup-xxx --host host-xxx
        pass

    def download_snapshot(self):
        repository = self._config['repositories']['app2_dd']
        # sudo RESTIC_REPOSITORY=test/repositories/app2 RESTIC_PASSWORD=bca restic dump cbaa5728c139b8043aa1e8256bfe005ec572abb709eb3ced620717d4243758e1 / > /tmp/prout.tar

        response = call_restic(
                        cmd='dump',
                        args=['cbaa5728c139b8043aa1e8256bfe005ec572abb709eb3ced620717d4243758e1', '/sources/.truc'],
                        env=self._get_restic_repository_envs(repository),
                        logger=self._logger,
                        json=True
                    )['stdout']

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

                self._unlock_repository(repository)
        return self._task_manager.add_task(
            task=Task(fn=do_init_repository, priority=priority, id="init_repo_%s" % repository_name),
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
                self._unlock_repository(repository)
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
            task=Task(fn=do_check_repository, priority=priority, id="check_repo_%s" % repository_name),
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
                self._unlock_repository(repository)
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
            task=Task(fn=do_restore_snapshot, priority=priority, id="restore_snap_%s_%s" % (repository_name, snapshot)),
            ignore_if_duplicate=True,
            get_result=False
        )

    def _hook(self, hook):
        if hook['type'] != 'http':
            raise Exception('Only http implemented')

        @retry(wait_exponential_multiplier=1000, wait_exponential_max=10000, stop_max_attempt_number=hook['retries'])
        def do_hook():
            response = getattr(requests, hook.get('method', 'post').lower())(
                hook['url'],
                timeout=convert_to_seconds(hook['timeout']) if 'timeout' in hook else None
            )

            response.raise_for_status()

        do_hook()

    def prune(self, backup_name, priority=None, get_result=False):
        backup = self._config['backups'][backup_name]
        prune = backup['prune']

        if not priority:
            priority = prune.get('priority', 'normal')

        self._logger.info('prune requested', extra={
            'component': 'daemon',
            'action': 'prune',
            'backup': backup['name'],
            'status': 'queuing'
        })

        def do_prune():
            self._logger.info('Starting prune', extra={
                'component': 'daemon',
                'action': 'prune',
                'backup': backup['name'],
                'status': 'starting'
            })

            all_repo_ok = True
            for repository_name in backup['repositories']:
                repository = self._config['repositories'][repository_name]
                self._logger.info('Starting prune on repository', extra={
                    'component': 'daemon',
                    'action': 'prune',
                    'subaction': 'prune_repository',
                    'backup': backup['name'],
                    'repository': repository['name'],
                    'status': 'starting'
                })
                try:
                    options = ['--prune', '--tag', quote('backup-' + backup['name']), '--host', self._config['hostname']] + self._get_restic_global_opts(backup)

                    for retention_policy_key in prune['retentionPolicy']:
                        retention_policy_value = prune['retentionPolicy'][retention_policy_key]

                        mapping = {
                            'nbOfHourly': 'hourly',
                            'nbOfdaily': 'daily',
                            'nbOfWeekly': 'weekly',
                            'nbOfMonthly': 'monthly',
                            'nbOfYearly': 'yearly',
                            'minTime': 'within'
                        }

                        if not retention_policy_key in mapping:
                            raise Exception('Unknown policy rule ' + retention_policy_key)

                        options.append('--keep-' + mapping[retention_policy_key])
                        options.append(str(retention_policy_value))

                    self._unlock_repository(repository)
                    call_restic(cmd='forget', args=options, env=self._get_restic_repository_envs(repository), logger=self._logger)
                    self._logger.info('Prune on repository ended :)', extra={
                        'component': 'daemon',
                        'action': 'prune',
                        'subaction': 'prune_repository',
                        'backup': backup['name'],
                        'repository': repository['name'],
                        'status': 'success'
                    })
                except Exception as e:
                    self._logger.exception('Prune on repository failed :(', extra={
                        'component': 'daemon',
                        'subaction': 'prune_repository',
                        'action': 'prune',
                        'backup': backup['name'],
                        'repository': repository['name'],
                        'status': 'failure'
                    })
                    all_repo_ok = False

            if all_repo_ok:
                self._logger.info('Prune ended :)', extra={
                    'component': 'daemon',
                    'action': 'prune',
                    'backup': backup['name'],
                    'status': 'success'
                })
            else:
                self._logger.error('Prune failed (prune in repository failed) :(', extra={
                    'component': 'daemon',
                    'action': 'prune',
                    'backup': backup['name'],
                    'status': 'failure'
                })

        self._task_manager.add_task(
            task=Task(fn=do_prune, priority=priority, id="prune_%s" % backup_name),
            ignore_if_duplicate=True,
            get_result=get_result
        )

    def backup(self, backup_name, caller_node, priority=None, get_result=False):
        backup = self._config['backups'][backup_name]
        id = "backup_%s" % backup_name
        node = caller_node.extends(id)

        self._logger.info('backup requested', extra={
            'component': 'daemon',
            'action': 'backup',
            'backup': backup['name'],
            'status': 'queuing',
            'node': node
        })

        if not priority:
            priority = backup.get('priority', 'normal')

        def do_backup():
            self._logger.info('Starting backup', extra={
                'component': 'daemon',
                'action': 'backup',
                'backup': backup['name'],
                'status': 'starting',
                'node': node
            })

            hook = glom(backup, 'hooks.before', default=None)
            hook_ok = True
            if hook:
                hook_node = node.extends('hook')
                # Should be good subaction ?
                self._logger.info('Starting backup before hook', extra={
                    'component': 'daemon',
                    'action': 'backup',
                    'subaction': 'run_hook',
                    'backup': backup['name'],
                    'hook': 'before',
                    'status': 'starting',
                    'node': hook_node
                })

                try:
                    self._hook(hook)

                    self._logger.info('Success backup before hook', extra={
                        'component': 'daemon',
                        'action': 'backup',
                        'subaction': 'run_hook',
                        'backup': backup['name'],
                        'hook': 'before',
                        'status': 'sucess',
                        'node': hook_node
                    })

                except Exception as e:
                    self._logger.exception('Failure backup before hook', extra={
                        'component': 'daemon',
                        'action': 'backup',
                        'subaction': 'run_hook',
                        'backup': backup['name'],
                        'hook': 'before',
                        'status': 'failure',
                        'node': hook_node
                    })

                    if hook['onfailure'] == 'stop':
                        self._logger.error('Backup failed (before hook failed) :(', extra={
                            'component': 'daemon',
                            'action': 'backup',
                            'backup': backup['name'],
                            'status': 'failure',
                            'node': node
                        })
                        return

                    if not hook['onfailure'] == 'ignore':
                        hook_ok = False

            all_repo_ok = True
            for repository_name in backup['repositories']:
                repository = self._config['repositories'][repository_name]
                repo_node = node.extends('repository_%s' % repository['name'])
                self._logger.info('Starting backup on repository', extra={
                    'component': 'daemon',
                    'action': 'backup',
                    'subaction': 'backup_repository',
                    'backup': backup['name'],
                    'repository': repository['name'],
                    'status': 'starting',
                    'node': repo_node
                })
                try:
                    options = ['--tag', quote('backup-' + backup['name']), '--host', self._config['hostname']] + self._get_restic_global_opts(backup)
                    args = backup['paths'] + list(map(lambda exclude : '--exclude=' + quote(exclude), backup.get('excludes', [])))
                    self._unlock_repository(repository)
                    call_restic(cmd='backup', args=options + args, env=self._get_restic_repository_envs(repository), logger=self._logger, caller_node=repo_node)
                    self._logger.info('Backup on repository ended :)', extra={
                        'component': 'daemon',
                        'action': 'backup',
                        'subaction': 'backup_repository',
                        'backup': backup['name'],
                        'repository': repository['name'],
                        'status': 'success',
                        'node': repo_node
                    })
                except Exception as e:
                    self._logger.exception('Backup on repository failed :(', extra={
                        'component': 'daemon',
                        'subaction': 'backup_repository',
                        'action': 'backup',
                        'backup': backup['name'],
                        'repository': repository['name'],
                        'status': 'failure',
                        'node': repo_node
                    })
                    all_repo_ok = False

            if all_repo_ok and hook_ok:
                self._logger.info('Backup ended :)', extra={
                    'component': 'daemon',
                    'action': 'backup',
                    'backup': backup['name'],
                    'status': 'success',
                    'node': node
                })
            else:
                self._logger.error('Backup failed (hook or backup in repository failed) :(', extra={
                    'component': 'daemon',
                    'action': 'backup',
                    'backup': backup['name'],
                    'status': 'failure',
                    'node': node
                })

        self._task_manager.add_task(
            task=Task(fn=do_backup, priority=priority, id="backup_%s" % backup_name),
            ignore_if_duplicate=True,
            get_result=get_result
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

    def _unlock_repository(self, repository):
        # TODO LOG
        call_restic(cmd='unlock', args=self._get_restic_global_opts(), env=self._get_restic_repository_envs(repository), logger=self._logger)
