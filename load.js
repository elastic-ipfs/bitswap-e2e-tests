
import fs from 'fs/promises'
import { mkdirSync } from 'fs'
import path from 'path'
import autocannon from 'autocannon'

import * as helper from './helper/index.js'
import * as load from './helper/load.js'
import { dirname } from './lib/util.js'

const PROXY_CONCURRENCY = process.env.PROXY_CONCURRENCY ? parseInt(process.env.PROXY_CONCURRENCY) : 8
const TARGET_ENV = process.env.TARGET_ENV ?? 'local'
const ONLY = process.env.ONLY
const TEST_ENV = process.env.TEST_ENV ?? 'dev'
const TEST_CLIENTS = process.env.TEST_CLIENTS ? parseInt(process.env.TEST_CLIENTS) : 5
const TEST_DURATION = process.env.TEST_DURATION ? parseInt(process.env.TEST_DURATION) : 30 // sec
const TEST_AMOUNT = process.env.TEST_AMOUNT ? parseInt(process.env.TEST_AMOUNT) : undefined
const TEST_CONNECTIONS = process.env.TEST_CONNECTIONS ? parseInt(process.env.TEST_CONNECTIONS) : 200
const TEST_TIMEOUT = process.env.TEST_TIMEOUT ? parseInt(process.env.TEST_TIMEOUT) : 5 * 60 // sec
const RESULT_FILE = process.env.RESULT_FILE ?? 'result/load.json'
const MUXERS = process.env.MUXERS ? process.env.MUXERS.split(',') : ['mplex', 'yamux']

async function test () {
  const requests = await load.loadCases({
    dir: path.join(dirname(import.meta.url), './snaps', TEST_ENV, 'load'),
    only: ONLY
  })

  let done = 0
  const results = {}
  const start = Date.now()

  // run concurrent requests
  for (let i = 0; i < TEST_CLIENTS; i++) {
    const service = await helper.startProxy({
      target: helper.targets[TARGET_ENV],
      concurrency: PROXY_CONCURRENCY,
      name: i + 1,
      muxers: MUXERS
    })

    console.log(` *** running #${i + 1} ...`)
    autocannon({
      url: service.url,
      ...service.request,
      workers: requests.length,
      requests,
      duration: TEST_DURATION,
      amount: TEST_AMOUNT,
      connections: TEST_CONNECTIONS,
      timeout: TEST_TIMEOUT
    }, (error, result) => {
      console.log(' *** done', `#${i + 1}`)
      if (error) { console.error({ error }) }

      results[i + 1] = result
      console.log(autocannon.printResult(result))

      if (++done === TEST_CLIENTS) {
        end({ start, service, results })
      }
    })
  }
}

async function end ({ start, service, results }) {
  const resultFile = path.join(dirname(import.meta.url), RESULT_FILE)
  mkdirSync(path.dirname(resultFile), { recursive: true })
  await fs.writeFile(resultFile, JSON.stringify(results, null, 2), 'utf8')
  console.log('done in ', Date.now() - start, 'ms')
  service.close()
}

test()
