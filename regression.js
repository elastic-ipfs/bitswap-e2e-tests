
import fs from 'fs/promises'
import { mkdirSync } from 'fs'
import path from 'path'
import autocannon from 'autocannon'

import * as helper from './helper/index.js'
import * as regression from './helper/regression.js'
import { dirname } from './lib/util.js'

const TARGET_ENV = process.env.TARGET_ENV ?? 'local'
const TEST_ENV = process.env.TEST_ENV ?? 'dev'
const UPDATE_SNAPS = !!process.env.UPDATE_SNAPS
const ONLY = process.env.ONLY
const VERBOSE = !!process.env.VERBOSE
const PROXY_CONCURRENCY = process.env.PROXY_CONCURRENCY ? parseInt(process.env.PROXY_CONCURRENCY) : 8
const RESULT_FILE = process.env.RESULT_FILE ?? 'result/regression.json'
const MUXERS = process.env.MUXERS ? process.env.MUXERS.split(',') : ['mplex', 'yamux']

async function test () {
  const service = await helper.startProxy({
    target: helper.targets[TARGET_ENV],
    concurrency: PROXY_CONCURRENCY,
    muxers: MUXERS
  })

  const c = await regression.loadCases({
    dir: path.join(dirname(import.meta.url), './snaps', TEST_ENV, 'regression'),
    request: service.request,
    updateSnaps: UPDATE_SNAPS,
    only: ONLY,
    verbose: VERBOSE
  })

  // run concurrent requests
  // match them with snap
  const start = Date.now()
  let done = 0
  const results = {}
  for (const case_ of c.cases) {
    console.log(' *** running', case_.file, case_.test, '...')
    autocannon({
      url: service.url,
      requests: [case_],
      duration: case_.test.duration ?? 1,
      amount: case_.test.amount,
      connections: case_.test.connections,
      timeout: case_.test.timeout
    }, (error, result) => {
      console.log(' *** done', case_.file, case_.count)
      if (error) { console.error({ error }) }

      results[case_.file] = result
      console.log(autocannon.printResult(result))

      if (++done === c.cases.length) {
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
