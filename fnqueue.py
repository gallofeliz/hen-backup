import time, threading

class FnQueue():
    def __init__(self):
        self._list = []

    def consume(self):
        while len(self._list) == 0:
            time.sleep(5)

        return self._list.pop(0)

    def push(self, fn, args=(), kwargs={}, id=None):
        if id is None:
           id = str(fn) + str(args) + str(kwargs)

        for item in self._list:
            if item['id'] == id:
                return

        self._list.append({
            'id': id,
            'fn': fn,
            'args': args,
            'kwargs': kwargs
        })

class FnQueueRunner():
    def __init__(self, fn_queue, on_error=None):
        self._queue = fn_queue
        self._on_error = on_error

    def run(self):
        while True:
            try:
                item = self._queue.consume()
                item['fn'](*item['args'], **item['kwargs'])
            except Exception as e:
                if self._on_error:
                    self._on_error(e)
                else:
                    raise e
                # Push in queue again ?

class ThreadedFnQueueRunner(FnQueueRunner):
    def run(self):
        threading.Thread(target=FnQueueRunner.run, args=(self,)).start()
