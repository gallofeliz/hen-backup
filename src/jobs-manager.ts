// import threading
// from uuid import uuid4

// class Task():
//     def __init__(self, fn, args=(), kwargs={}, id:any=None, priority='normal'):
//         self._fn = fn
//         self._args = args
//         self._kwargs = kwargs
//         self._id = uuid4() if id is None else id
//         self._state = 'new'
//         self._result = None
//         self._event = None

//         if not priority in ['immediate', 'next', 'superior', 'normal', 'inferior', 'on-idle'] and not type(priority) is int:
//             raise Exception('Invalid priority : excepted immediate, next, normal or int number')

//         self._priority = priority

//     def get_id(self) -> any:
//         return self._id

//     def get_priority(self):
//         return self._priority

//     def is_started(self):
//         return self._state != 'new'

//     def is_running(self):
//         return self._state == 'running'

//     def is_ended(self):
//         return self._state == 'success' or self._state == 'failure'

//     def run(self):
//         if self.is_started():
//             raise Exception('Already started')

//         self._state = 'running'
//         try:
//             result = self._fn(*self._args, **self._kwargs)
//             self._state = 'success'
//             self._result = result
//         except Exception as e:
//             self._state = 'failure'
//             self._result = e
//             if not self._event:
//                 raise Exception('Unhandled exception detected')

//         if self._event:
//             self._event.set()

//     def abort(self):
//         pass

//     def wait_until_ended(self):
//         self._event = threading.Event()
//         self._event.wait()

//     def get_result(self):
//         self.wait_until_ended()
//         if self._state == 'success':
//             return self._result
//         raise self._result

// class TaskManager():
//     def __init__(self, logger):
//         self._list = []
//         self._logger = logger
//         self._wait_list = None
//         self._started = False
//         self._running_tasks = []

//     def get_queueing_tasks(self):
//         return self._list

//     def add_task(self, task, get_result=False):
//         for item in self._list:
//            if item == task:
//                return

//         if task.is_started():
//             raise Exception('Task already started')

//         # Add timeout to execute on immediate (in parallel) some backup task to avoid long task freezing queue ?
//         # Can use priority on backups to manage some "urgent" backups ?
//         # Add a priority like 'alone' to not use queue place (see immediate), and timeout with next to run alone if current is too long ?
//         # For example a backup each 5 mins that allow some minutes to wait but not hours :
//         #    - immediate
//         #    - next (or priority is a timeout ?) with timeout, example priority="3m", will wait max 3m and after run alone ?
//         # Manage parallel calls, but how to control Bandwith, repository locks, CPU usage, etc ?

//         priority = task.get_priority()

//         if priority == 'immediate' and len(self._list) != 0 and self._started:
//             threading.Thread(target=self._run_task, args=(task,)).start()
//         else:
//             index = 0
//             for ctask in self._list:
//                 if self._is_prio_sup(task, ctask):
//                     break
//                 else:
//                     index = index + 1

//             self._list.insert(index, task)

//         self._logger.info('Added task', extra={
//             'component': 'task_manager',
//             'action': 'add_task',
//             'priority': priority,
//             'queue_size': len(self._list),
//             'status': 'success'
//         })

//         if self._wait_list and len(self._list) != 0:
//             self._wait_list.set()

//         if get_result:
//             return task.get_result()

//     def _is_prio_sup(self, task, ctask):
//         # 'immediate', 'next', 'superior', 'normal', 'inferior', 'on-idle'
//         priority = task.get_priority()
//         cpriority = ctask.get_priority()

//         if priority == 'immediate':
//             return True

//         if priority == 'next' and cpriority != 'immediate':
//             return True

//         if priority == 'on-idle':
//             return False

//         if cpriority == 'immediate' or cpriority == 'next':
//             return False

//         if cpriority == 'on-idle':
//             return True

//         if priority == 'normal':
//             priority = 0

//         if cpriority == 'normal':
//             cpriority = 0

//         if priority == 'superior' and cpriority != 'superior':
//             return True

//         if priority == 'inferior' and cpriority != 'inferior':
//             return False

//         if cpriority == 'superior' and priority != 'superior':
//             return False

//         if cpriority == 'inferior' and priority != 'inferior':
//             return True

//         return priority > cpriority

//     def run(self):
//         self._started = True

//         nb_immediates = 0
//         for task in self._list:
//             if task.get_priority == 'immediate':
//                 nb_immediates += 1

//         if nb_immediates > 1:
//             for x in range(1, nb_immediates):
//                 task = self._list.pop(0)
//                 threading.Thread(target=self._run_task, args=(task,))

//         threading.Thread(target=self._routine).start()

//     def stop(self):
//         self._started = False
//         if self._wait_list:
//             self._wait_list.set()

//         for task in self._running_tasks:
//             threading.Thread(target=task.abort).start()

//     def get_stats(self):
//         return {
//             'running': self._started,
//             'tasks': {
//                 'queuing': len(self._list),
//                 'running': len(self._running_tasks)
//             }
//         }

//     def _run_task(self, task):
//         self._logger.info('Running task', extra={
//             'component': 'task_manager',
//             'action': 'run_task',
//             'queue_size': len(self._list),
//             'status': 'starting'
//         })

//         self._running_tasks.append(task)

//         try:
//             task.run()
//         except Exception as e:
//             self._logger.exception('Unexpected exception on task run')

//         self._running_tasks.remove(task)

//     def _routine(self):
//         while True:
//             task = self._get_next()
//             if not task and not self._started:
//                 break;
//             self._run_task(task)

//     def _get_next(self):
//         if len(self._list) == 0 and self._started:
//             self._wait_list = threading.Event()
//             self._wait_list.wait()

//         self._wait_list = None

//         if not self._started:
//             return

//         # while len(self._list) == 0:
//         #     time.sleep(5)

//         return self._list.pop(0)
