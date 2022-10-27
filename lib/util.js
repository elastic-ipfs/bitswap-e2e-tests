
import path from 'path'
import url from 'url'

function sleep (ms) {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}

function dirname (importMetaUrl) {
  return path.dirname(url.fileURLToPath(importMetaUrl))
}

export { sleep, dirname }
