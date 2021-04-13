import rpyc, threading

class Server(rpyc.Service):

    def __init__(self, logger, daemon):
        self.__logger = logger
        self.__daemon = daemon
        logger.info('Starting RPC service')

    def exposed_list_snapshots(self, repository_name, backup_name=None, hostname=None):
        return self.__daemon.list_snapshots(repository_name, hostname, backup_name)
        # try:

        #     parser = argparse.ArgumentParser()
        #     parser.add_argument("command")
        #     command = parser.parse_args(args=argv[1:2]).command

        #     if command == 'echo':
        #         parser = argparse.ArgumentParser()
        #         parser.add_argument("str")
        #         strr = parser.parse_args(args=argv[2:]).str
        #         print(strr, file=stdout)

        #     else:
        #         raise Exception('Unknow command %s' % command)

        #     return 0
        # except Exception as e:
        #     print(e, file=stderr)
        #     return 1
    def restore_snapshot(self, repository_name, snapshot, target_path=None):
        return #self.__daemon.restore_snapshot(repository_name, snapshot, target_path, block=False)

def create_server(logger, daemon, port=18812):
    rpc = rpyc.ThreadedServer(service=Server(logger=logger, daemon=daemon), port=port, protocol_config={'allow_all_attrs': True, "allow_public_attrs":True})
    threading.Thread(target=rpc.start).start()
