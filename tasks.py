import threading, time

class Task():
    def __init__(self, fn, args=(), kwargs={}, id=None):
        self._fn = fn
        self._args = args
        self._kwargs = kwargs

        if id is None:
           id = str(fn) + str(args) + str(kwargs)

        self._id = id
        self._state = 'new'
        self._event = threading.Event()
        self._result = None

    def get_id(self):
        return self._id

    def is_ended(self):
        return self._state == 'success' or self._state == 'failure'

    def run(self):
        if self._state != 'new':
            raise Exception('Already started')

        self._state = 'running'
        try:
            result = self._fn(*self._args, **self._kwargs)
            self._state = 'success'
            self._result = result
        except Exception as e:
            self._state = 'failure'
            self._result = e

        self._event.set()

    def wait_until_ended(self):
        self._event.wait()

    def self.get_result(self):
        self.wait_until_ended()
        if self._result == 'success':
            return self._result
        raise self._result

class TaskManager():
    def __init__(self, logger):
        self._list = []
        self._logger = logger
        self._wait_list = None

    def add_task(self, task, priority='normal', ignore_duplicate=True, get_result=False):
        if ignore_duplicate:
            for item in self._list:
                if item.get_id() == task.get_id():
                    return

        if priority == 'normal':
            self._list.append(task)
        elif priority == 'next':
            self._list.insert(0, task)
        elif priority == 'immediate':
            threading.Thread(target=task.run).start()
        else:
            raise Exception('Invalid priority')

        if self._wait_list and len(self_.list) != 0:
            self._wait_list.set()

        if get_result:
            return task.get_result()

    def run(self):
        threading.Thread(target=self._routine).start()

    def _routine(self):
        while True:
            task = self._get_next()
            try:
                task.run()
            except Exception as e:
                self._logger.exception('Unexpected exception on task run')

    def _get_next(self):
        if len(self._list) == 0:
            self._wait_list = threading.wait()

        self._wait_list = None

        # while len(self._list) == 0:
        #     time.sleep(5)

        return self._list.pop(0)
