import { Logger } from './logger'
import { Config } from './config'
import Daemon from './daemon'

export default class Api {
    protected logger: Logger

    constructor(config: Config['api'], daemon: Daemon, logger: Logger) {
        this.logger = logger

        // if 'api' in self._config:
        //     self._http_server = HttpServer(
        //         service=self,
        //         method_names=[
        //             'get_config_summary',
        //             'list_snapshots',
        //             'explain_snapshot'
        //         ],
        //         port=self._config['api']['port'],
        //         logger=self._logger,
        //         credentials=self._config['api']['credentials']
        //     )

    }

    public start() {
    }

    public stop() {
    }
}
