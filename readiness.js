
import test from 'node:test'
import assert from 'node:assert'
import { request } from './helper/http.js'
import { sendTraffic, setupService, teardownService, waitServiceToBeUnloaded } from './helper/readiness.js'
import { targets } from './helper/index.js'

const REQUEST_TIMEOUT = process.env.TEST_REQUEST_TIMEOUT ? parseInt(process.env.TEST_REQUEST_TIMEOUT) : 100
const REQUEST_RETRIES = process.env.TEST_REQUEST_RETRIES ? parseInt(process.env.TEST_REQUEST_RETRIES) : 50
const BITSWAP_HOST = process.env.TEST_BITSWAP_HOST ?? 'http://localhost:3001'
const TARGET_ENV = process.env.TARGET_ENV ?? 'local'

const READINESS_MAX_CONNECTIONS = 5
const READINESS_MAX_PENDING_REQUEST_BLOCKS = 100
const READINESS_MAX_EVENT_LOOP_UTILIZATION = 0.8

const TRAFFIC_LOOP = 3
const TARGET = targets[TARGET_ENV]

test.describe('service readiness', { concurrency: 1 }, () => {
  test.before(() => setupService({
    readinessMaxConnections: READINESS_MAX_CONNECTIONS,
    readinessMaxPendingRequestBlocks: READINESS_MAX_PENDING_REQUEST_BLOCKS,
    readinessMaxEventLoopUtilization: READINESS_MAX_EVENT_LOOP_UTILIZATION,
    requestTimeout: REQUEST_TIMEOUT,
    requestRetries: REQUEST_RETRIES,
    bitswapHost: BITSWAP_HOST
  }))
  test.after(teardownService)

  test.it('should be ok on start', async () => {
    const readiness = await request({ url: `${BITSWAP_HOST}/readiness`, timeout: REQUEST_TIMEOUT, retries: 1, allowError: true })
    assert.equal(readiness.statusCode, 200)
  })

  for (let i = 0; i < TRAFFIC_LOOP; i++) {
    test.it(`should be ok on low traffic load - round ${i + 1}`, async () => {
      await waitServiceToBeUnloaded({ bitswapHost: BITSWAP_HOST, requestTimeout: REQUEST_TIMEOUT })
      await sendTraffic({ target: TARGET, connections: Math.floor(READINESS_MAX_CONNECTIONS / 2), requests: Math.floor(READINESS_MAX_PENDING_REQUEST_BLOCKS / 2) })

      const readiness = await request({ url: `${BITSWAP_HOST}/readiness`, timeout: REQUEST_TIMEOUT, retries: 1, allowError: true })

      assert.equal(readiness.statusCode, 200)
    })

    test.it(`should be ok on high traffic load - round ${i + 1}`, async () => {
      await waitServiceToBeUnloaded({ bitswapHost: BITSWAP_HOST, requestTimeout: REQUEST_TIMEOUT })
      await sendTraffic({ target: TARGET, connections: Math.floor(READINESS_MAX_CONNECTIONS * 2), requests: Math.floor(READINESS_MAX_PENDING_REQUEST_BLOCKS * 2) })

      const readiness = await request({ url: `${BITSWAP_HOST}/readiness`, timeout: REQUEST_TIMEOUT, retries: 1, allowError: true })

      assert.equal(readiness.statusCode, 503)
    })

    test.it(`should restore to healty state after resolving hight traffic load - round ${i + 1}`, async () => {
      await waitServiceToBeUnloaded({ bitswapHost: BITSWAP_HOST, requestTimeout: REQUEST_TIMEOUT })
      await sendTraffic({ target: TARGET, connections: Math.floor(READINESS_MAX_CONNECTIONS * 2), requests: Math.floor(READINESS_MAX_PENDING_REQUEST_BLOCKS * 2) })
      await waitServiceToBeUnloaded({ bitswapHost: BITSWAP_HOST, requestTimeout: REQUEST_TIMEOUT })

      const readiness = await request({ url: `${BITSWAP_HOST}/readiness`, timeout: REQUEST_TIMEOUT, retries: 1, allowError: true })

      assert.equal(readiness.statusCode, 200)
    })
  }

  test.it('should not interfere and been affected by metrics calls', async () => {
    await waitServiceToBeUnloaded({ bitswapHost: BITSWAP_HOST, requestTimeout: REQUEST_TIMEOUT })

    await request({ url: `${BITSWAP_HOST}/metrics`, timeout: REQUEST_TIMEOUT, retries: 1 })
    await sendTraffic({ target: TARGET, connections: Math.floor(READINESS_MAX_CONNECTIONS * 2), requests: Math.floor(READINESS_MAX_PENDING_REQUEST_BLOCKS * 2) })
    await request({ url: `${BITSWAP_HOST}/metrics`, timeout: REQUEST_TIMEOUT, retries: 1 })

    await waitServiceToBeUnloaded({ bitswapHost: BITSWAP_HOST, requestTimeout: REQUEST_TIMEOUT })

    const readiness = await request({ url: `${BITSWAP_HOST}/readiness`, timeout: REQUEST_TIMEOUT, retries: 1, allowError: true })

    assert.equal(readiness.statusCode, 200)
  })
})
