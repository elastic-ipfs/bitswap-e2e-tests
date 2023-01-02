
import path from 'path'
import { dirname, createLogger, version as getVersion } from 'e-ipfs-core-lib'

let level = 'info'

if (process.env.LOG_LEVEL) {
  level = process.env.LOG_LEVEL
} else if (process.env.NODE_DEBUG) {
  level = 'debug'
}

const version = getVersion(path.join(dirname(import.meta.url), '../package.json'))
const pretty = Boolean(process.env.LOG_PRETTY === 'true')
const logger = createLogger({ version, level, pretty })

export {
  logger,
  version
}
