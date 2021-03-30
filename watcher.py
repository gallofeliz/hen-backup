from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class WatchdogFnHandler(FileSystemEventHandler):
    def __init__(self, fn, args=(), kwargs={}, on_error=None):
        self._fn = fn
        self._args = args
        self._kwargs = kwargs
        self._on_error = on_error

    def on_any_event(self, event):
        try:
            self._fn(*self._args, **self._kwargs)
        except Exception as e:
            if self._on_error:
                self._on_error(e)
            else:
                raise e

def create_watch_callback(paths, fn, args=(), kwargs={}, on_error=None):
    observer = Observer()
    handler = WatchdogFnHandler(fn, args, kwargs, on_error)
    for path in paths:
        observer.schedule(handler, path, recursive=True)
    observer.start()
