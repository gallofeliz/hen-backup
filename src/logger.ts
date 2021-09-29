const levels = [
    'debug',
    'info',
    'notice',
    'warning',
    'error'
]

let index = 0;

export default class Logger {
    protected id: string
    protected metadatas: Record<string, any>
    protected level: string
    protected levels: string[]

    constructor(name: string, level: string, parent?: Logger, metadatas?: Record<string, any>) {
        this.id = (parent ? parent.getId() + ' > ' : '') + name + '(' + (index++) + ')'
        this.metadatas = metadatas || {}
        this.levels = levels.slice(levels.indexOf(level))
        this.level = level
    }

    public getId() {
        return this.id
    }

    public child(childName: string, metadatas?: Record<string, any>) {
        return new Logger(childName, this.level, this, {...this.metadatas, ...metadatas})
    }

    public info(message: string, metadatas: Record<string, any> = {}) {
        this.record('info', message, metadatas)
    }

    protected record(level: string, message: string, metadatas: Record<string, any> = {}) {
        if (!this.levels.includes(level)) {
            return
        }

        const std = ['debug', 'info'].includes(level) ? 'out' : 'err'

        const json = {
            logger: this.id,
            level,
            message,
            ...this.metadatas,
            ...metadatas || {}
        }

        console[std === 'out' ? 'log' : 'error'](this.sanitize(JSON.stringify(json)))
    }

    protected sanitize(str: string): string {
        return str.replace(
            /"(.*?(PASSWORD|KEY|SECRET|AUTH|TOKEN|CREDENTIAL).*?)":"([^"]+)"/ig,
            '"$1": "***"'
        )
    }
}
