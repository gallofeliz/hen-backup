import loadConfig from './config'
import Application from './application'
import { handleExitSignals } from 'js-libs/exit-handle'

const application = new Application(loadConfig(process.argv[2]))

application.start()

handleExitSignals(() => application.stop())
