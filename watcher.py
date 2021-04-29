from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import pathspec

class WatchdogFnHandler(FileSystemEventHandler):
    def __init__(self, fn, args=(), kwargs={}, on_error=None, ignore=[]):
        self._fn = fn
        self._args = args
        self._kwargs = kwargs
        self._on_error = on_error
        self._ignore = ignore

    def on_any_event(self, event):
        path1 = event.src_path
        path2 = event.dest_path if hasattr(event, 'dest_path') else None

        # use Git Pattern as Restic uses something similar (Glob is not standardized WTF !)
        spec = pathspec.PathSpec.from_lines(pathspec.patterns.GitWildMatchPattern, self._ignore)

        if spec.match_file(path1) and (not path2 or spec.match_file(path2)):
            return

        try:
            self._fn(*self._args, **self._kwargs)
        except Exception as e:
            if self._on_error:
                self._on_error(e)
            else:
                raise e

def create_watch_callback(paths, fn, args=(), kwargs={}, on_error=None, ignore=[]):
    observer = Observer()
    handler = WatchdogFnHandler(fn, args, kwargs, on_error, ignore)
    for path in paths:
        observer.schedule(handler, path, recursive=True)
    observer.start()
