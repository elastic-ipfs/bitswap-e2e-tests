'use strict'

const fs = require('fs/promises')
const path = require('path')
const autocannon = require('autocannon')

const helper = require('./helper')
const load = require('./helper/load')

const PROXY_CONCURRENCY = process.env.PROXY_CONCURRENCY ? parseInt(process.env.PROXY_CONCURRENCY) : 8
const TARGET_ENV = process.env.TARGET_ENV ?? 'local'
const ONLY = process.env.ONLY
const TEST_ENV = process.env.TEST_ENV ?? 'dev'
const TEST_CLIENTS = process.env.TEST_CLIENTS ? parseInt(process.env.TEST_CLIENTS) : 10
const TEST_DURATION = process.env.TEST_DURATION ? parseInt(process.env.TEST_DURATION) : 30 // sec
const TEST_AMOUNT = process.env.TEST_AMOUNT ? parseInt(process.env.TEST_AMOUNT) : undefined
const TEST_CONNECTIONS = process.env.TEST_CONNECTIONS ? parseInt(process.env.TEST_CONNECTIONS) : 250
const TEST_TIMEOUT = process.env.TEST_TIMEOUT ? parseInt(process.env.TEST_TIMEOUT) : 5 * 60 // sec
const RESULT_FILE = process.env.RESULT_FILE ?? 'result/load.json'

async function test () {
  const requests = await load.loadCases({
    dir: path.join(__dirname, './snaps', TEST_ENV, 'load'),
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
      name: i + 1
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
  await fs.writeFile(path.join(__dirname, RESULT_FILE), JSON.stringify(results, null, 2), 'utf8')
  console.log('done in ', Date.now() - start, 'ms')
  service.close()
}

test()
