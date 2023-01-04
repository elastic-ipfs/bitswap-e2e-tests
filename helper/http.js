
import got from 'got'
import { spawn } from 'node:child_process'

export function startBitswapService ({ path, env, stdio }) {
  if (!path) {
    console.error('ERROR: missing path for bitswap service to start')
    throw new Error('MISSING_PATH_FOR_BITSWAP_SERVICE_TO_START')
  }
  console.log('bitswap service starting ...')
  if (stdio) {
    stdio = ['ignore', process.stdout, process.stderr]
  }
  return spawn('node', ['src/index.js'], { cwd: path, env, stdio })
}

export async function stopBitswapService (service) {
  console.log('bitswap service ending ...')
  service.kill('SIGINT')
  console.log('bitswap service ended')
}

export async function request ({ url, timeout, retries, allowError }) {
  let response
  let _retries = 0

  do {
    try {
      response = await got.get(url, {
        timeout: { request: timeout },
        retry: { limit: 1 },
        throwHttpErrors: !allowError
      })
    } catch (err) {
      console.log('request retry', ++_retries, url)
    }
  } while (!response && _retries < retries)

  return response
}
