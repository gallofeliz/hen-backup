from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import pathspec, time, threading

class WatchdogFnHandler(FileSystemEventHandler):
    def __init__(self, fn, args=(), kwargs={}, on_error=None, ignore=[], wait_min=1, wait_max=60):
        self._fn = fn
        self._args = args
        self._kwargs = kwargs
        self._on_error = on_error
        self._ignore = ignore
        self._wait_min = wait_min
        self._wait_max = wait_max
        self._pending = None

    def _pending_wait(self):
        while(True):
            now = time.time()
            max_time = self._pending['start_time'] + self._wait_max
            if now >= max_time:
                break
            wait_time = min(self._wait_min, max_time - now)
            self._pending['listener'].clear()
            listener_called = self._pending['listener'].wait(wait_time)
            if not listener_called:
                break

        self._pending = None
        self._call_callback()

    def on_any_event(self, event):
        path1 = event.src_path
        path2 = event.dest_path if hasattr(event, 'dest_path') else None

        # use Git Pattern as Restic uses something similar (Glob is not standardized WTF !)
        spec = pathspec.PathSpec.from_lines(pathspec.patterns.GitWildMatchPattern, self._ignore)

        if spec.match_file(path1) and (not path2 or spec.match_file(path2)):
            return

        if not self._pending:
            self._pending = {
                "start_time": time.time(),
                "listener": threading.Event()
            }

            threading.Thread(target=self._pending_wait).start()

            return

        self._pending['listener'].set()

    def _call_callback(self):
        try:
            self._fn(*self._args, **self._kwargs)
        except Exception as e:
            if self._on_error:
                self._on_error(e)
            else:
                raise e

def create_watch_callback(paths, fn, args=(), kwargs={}, on_error=None, ignore=[], wait_min=1, wait_max=60):
    observer = Observer()
    handler = WatchdogFnHandler(fn, args, kwargs, on_error, ignore, wait_min=wait_min, wait_max=wait_max)
    for path in paths:
        observer.schedule(handler, path, recursive=True)
    observer.start()
