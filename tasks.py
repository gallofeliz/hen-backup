import threading

class Task():
    def __init__(self, fn, args=(), kwargs={}, id=None, priority='normal'):
        self._fn = fn
        self._args = args
        self._kwargs = kwargs

        if id is None:
           id = str(fn) + str(args) + str(kwargs)

        self._id = id
        self._state = 'new'
        self._result = None
        self._event = None

        if not priority in ['next', 'normal', 'immediate']:
            raise Exception('Invalid priority')

        self._priority = priority

    def get_id(self):
        return self._id

    def get_priority(self):
        return self._priority

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
            if not self._event:
                raise Exception('Unhandled exception detected')

        if self._event:
            self._event.set()

    def abort(self):
        pass

    def wait_until_ended(self):
        self._event = threading.Event()
        self._event.wait()

    def get_result(self):
        self.wait_until_ended()
        if self._state == 'success':
            return self._result
        raise self._result

class TaskManager():
    def __init__(self, logger):
        self._list = []
        self._logger = logger
        self._wait_list = None
        self._started = False
        self._running_tasks = []

    def add_task(self, task, ignore_if_duplicate=True, get_result=False):
        if ignore_if_duplicate:
            for item in self._list:
                if item.get_id() == task.get_id():
                    return

        # Add timeout to execute on immediate (in parallel) some backup task to avoid long task freezing queue ?
        # Can use priority on backups to manage some "urgent" backups ?
        # Add a priority like 'alone' to not use queue place (see immediate), and timeout with next to run alone if current is too long ?
        # For example a backup each 5 mins that allow some minutes to wait but not hours :
        #    - immediate
        #    - next (or priority is a timeout ?) with timeout, example priority="3m", will wait max 3m and after run alone ?
        # Manage parallel calls, but how to control Bandwith, repository locks, CPU usage, etc ?

        priority = task.get_priority()

        if priority == 'normal':
            self._list.append(task)
        elif priority == 'next':
            index = 0
            for ctask in self._list:
                # Can be faster with == normal then index else after loop index = len(self._list)
                if ctask.get_priority() != 'normal':
                    index = self._list.index(ctask) + 1
                else:
                    break

            self._list.insert(index, task)
        elif priority == 'immediate':
            if len(self._list) == 0:
                self._list.append(task)
            else:
                threading.Thread(target=self._run_task, args=(task,))
        else:
            raise Exception('Invalid priority')

        self._logger.info('Added task', extra={
            'component': 'task_manager',
            'action': 'add_task',
            'priority': priority,
            'queue_size': len(self._list),
            'status': 'success'
        })

        if self._wait_list and len(self._list) != 0:
            self._wait_list.set()

        if get_result:
            return task.get_result()

    def run(self):
        self._started = True
        threading.Thread(target=self._routine).start()

    def stop(self):
        self._started = False
        if self._wait_list:
            self._wait_list.set()

        for task in self._running_tasks:
            threading.Thread(target=task.abort).start()

    def _run_task(self, task):
        self._logger.info('Running task', extra={
            'component': 'task_manager',
            'action': 'run_task',
            'queue_size': len(self._list),
            'status': 'starting'
        })

        self._running_tasks.append(task)

        try:
            task.run()
        except Exception as e:
            self._logger.exception('Unexpected exception on task run')

        self._running_tasks.remove(task)

    def _routine(self):
        while True:
            task = self._get_next()
            if not task and not self.started:
                break;
            self._run_task(task)

    def _get_next(self):
        if len(self._list) == 0 and self._started:
            self._wait_list = threading.Event()
            self._wait_list.wait()

        self._wait_list = None

        if not self._started:
            return

        # while len(self._list) == 0:
        #     time.sleep(5)

        return self._list.pop(0)
