
import test from 'node:test'
import assert from 'node:assert'
import { request, startBitswapService, stopBitswapService } from './helper/http.js'

const REQUEST_TIMEOUT = process.env.TEST_REQUEST_TIMEOUT ? parseInt(process.env.TEST_REQUEST_TIMEOUT) : 100
const REQUEST_RETRIES = process.env.TEST_REQUEST_RETRIES ? parseInt(process.env.TEST_REQUEST_RETRIES) : 50
const BITSWAP_HOST = process.env.TEST_BITSWAP_HOST ?? 'http://localhost:3001'

test('liveness', async t => {
  let service
  t.beforeEach(() => {
    service = startBitswapService({ path: process.env.START_BITSWAP_PATH })
  })
  t.afterEach(async () => {
    stopBitswapService(service)
  })

  await t.test('service is ready by liveness', async t => {
    const response = await request({ url: `${BITSWAP_HOST}/liveness`, timeout: REQUEST_TIMEOUT, retries: REQUEST_RETRIES })
    assert.equal(response.statusCode, 200)
  })
})
