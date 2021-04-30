from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import pathspec, time, threading

class WatchdogFnHandler(FileSystemEventHandler):
    def __init__(self, fn, args=(), kwargs={}, on_error=None, ignore=[], wait_min=1, wait_max=60, logger=None):
        self._fn = fn
        self._args = args
        self._kwargs = kwargs
        self._on_error = on_error
        self._ignore = ignore
        self._wait_min = wait_min
        self._wait_max = wait_max
        self._pending = None
        self._logger = logger

    def _pending_wait(self):
        self._logger and self._logger.info('Creating pending handler', extra={
            'component': 'fswatcher_callback',
            'action': 'pending_fn',
            'status': 'starting'
        })

        while(True):
            now = time.time()
            max_time = self._pending['start_time'] + self._wait_max
            if now >= max_time:
                self._logger and self._logger.debug('Timeout !', extra={
                    'component': 'fswatcher_callback',
                    'action': 'pending_fn',
                    'status': 'running'
                })
                break
            wait_time = min(self._wait_min, max_time - now)
            self._pending['listener'].clear()
            self._logger and self._logger.debug('Let\'s wait %s seconds' % wait_time, extra={
                'component': 'fswatcher_callback',
                'action': 'pending_fn',
                'status': 'running'
            })
            listener_called = self._pending['listener'].wait(wait_time)
            if not listener_called:
                self._logger and self._logger.debug('No more event, stop', extra={
                    'component': 'fswatcher_callback',
                    'action': 'pending_fn',
                    'status': 'running'
                })
                break

        self._logger and self._logger.info('Let\'s go executing cb !', extra={
            'component': 'fswatcher_callback',
            'action': 'pending_fn',
            'status': 'success'
        })

        self._pending = None
        self._call_callback()

    def on_any_event(self, event):
        self._logger and self._logger.debug('Receiving Event', extra={
            'component': 'fswatcher_callback',
            'action': 'receive_event',
            'status': 'starting',
            'event': event
        })

        path1 = event.src_path
        path2 = event.dest_path if hasattr(event, 'dest_path') else None
        # use Git Pattern as Restic uses something similar (Glob is not standardized WTF !)
        spec = pathspec.PathSpec.from_lines(pathspec.patterns.GitWildMatchPattern, self._ignore)

        if spec.match_file(path1) and (not path2 or spec.match_file(path2)):
            self._logger and self._logger.debug('Ignoring Event (ignore matching)', extra={
                'component': 'fswatcher_callback',
                'action': 'receive_event',
                'status': 'success',
                'event': event
            })
            return

        if not self._pending:
            self._logger and self._logger.debug('Creating pending handler', extra={
                'component': 'fswatcher_callback',
                'action': 'receive_event',
                'status': 'success',
                'event': event
            })

            self._pending = {
                "start_time": time.time(),
                "listener": threading.Event()
            }

            threading.Thread(target=self._pending_wait).start()

            return

        self._logger and self._logger.debug('Updating pending handler', extra={
            'component': 'fswatcher_callback',
            'action': 'receive_event',
            'status': 'success',
            'event': event
        })

        self._pending['listener'].set()

    def _call_callback(self):
        try:
            self._fn(*self._args, **self._kwargs)
        except Exception as e:
            if self._on_error:
                self._on_error(e)
            else:
                raise e

def create_fswatch_callback(paths, fn, args=(), kwargs={}, on_error=None, ignore=[], wait_min=1, wait_max=60, logger=None):
    observer = Observer()
    handler = WatchdogFnHandler(fn, args, kwargs, on_error, ignore, wait_min=wait_min, wait_max=wait_max, logger=logger)
    for path in paths:
        observer.schedule(handler, path, recursive=True)
    observer.start()
