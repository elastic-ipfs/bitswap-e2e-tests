'use strict'

const path = require('path')
const autocannon = require('autocannon')

const helper = require('./helper')
const load = require('./helper/load')

const PROXY_CONCURRENCY = process.env.PROXY_CONCURRENCY ? parseInt(process.env.PROXY_CONCURRENCY) : 8
const TARGET_ENV = process.env.TARGET_ENV ?? 'local'
const ONLY = process.env.ONLY
const TEST_ENV = process.env.TEST_ENV ?? 'dev'
const TEST_DURATION = process.env.TEST_DURATION ? parseInt(process.env.TEST_DURATION) : 60
const TEST_AMOUNT = process.env.TEST_AMOUNT ? parseInt(process.env.TEST_AMOUNT) : undefined
const TEST_CONNECTIONS = process.env.TEST_CONNECTIONS ? parseInt(process.env.TEST_CONNECTIONS) : 1e3
const TEST_TIMEOUT = process.env.TEST_TIMEOUT ? parseInt(process.env.TEST_TIMEOUT) : 5 * 60 // sec

async function test () {
  const service = await helper.startProxy({
    target: helper.targets[TARGET_ENV],
    concurrency: PROXY_CONCURRENCY
  })

  const requests = await load.loadCases({
    dir: path.join(__dirname, './snaps', TEST_ENV, 'load'),
    only: ONLY
  })

  // run concurrent requests
  // match them with snap
  const start = Date.now()

  console.log(' *** running ...')
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
    console.log(' *** done')
    if (error) { console.error({ error }) }

    // console.log({ result })
    console.log(autocannon.printResult(result))

    end({ start, service })
  })
}

async function end ({ start, service }) {
  console.log('done in ', Date.now() - start, 'ms')
  service.close()
}

test()
