import { setTimeout as sleep } from 'timers/promises'
import { readFileSync } from 'fs'
import { CID } from 'multiformats/cid'
import { BITSWAP_V_120 as protocol, Entry, Message, WantList } from 'e-ipfs-core-lib'
import * as helper from './index.js'
import { request, startBitswapService, stopBitswapService } from './http.js'
import { Connection } from '../lib/networking.js'

const TEST_ENV = process.env.TEST_ENV ?? 'dev'

const cids = JSON.parse(readFileSync(new URL(`../snaps/${TEST_ENV}/readiness/cids.json`, import.meta.url)))

let service, ready
let clients = []
let responses = 0
let pendings = 0

export async function setupService ({
  readinessMaxConnections,
  readinessMaxPendingRequestBlocks,
  readinessMaxEventLoopUtilization,
  requestTimeout,
  requestRetries,
  bitswapHost
}) {
  if (ready) { return }

  if (process.env.START_BITSWAP_PATH) {
    service = startBitswapService({
      path: process.env.START_BITSWAP_PATH,
      env: {
        READINESS_MAX_CONNECTIONS: readinessMaxConnections,
        READINESS_MAX_PENDING_REQUEST_BLOCKS: readinessMaxPendingRequestBlocks,
        READINESS_MAX_EVENT_LOOP_UTILIZATION: readinessMaxEventLoopUtilization
      }
      // stdio: true
    })
  }
  // wait for bitswap service to be ready
  await request({ url: `${bitswapHost}/liveness`, timeout: requestTimeout, retries: requestRetries })

  ready = true
}

export async function teardownService () {
  if (!service) { return }

  await stopBitswapService(service)
}

// TODO (long) timeout limit
export async function waitServiceToBeUnloaded ({ bitswapHost, requestTimeout }) {
  // eslint-disable-next-line no-unmodified-loop-condition
  while (pendings > 0 && responses < pendings) {
    await sleep(500)
  }

  // close all clients (async)
  clients.forEach(helper.endClient)

  // reset
  clients = []
  responses = 0
  pendings = 0

  // poll service untill is unloaded
  let load, retry
  do {
    load = JSON.parse((await request({ url: `${bitswapHost}/load`, timeout: requestTimeout, retries: 1 })).body)
    if (retry) { await sleep(100) }
    retry = true
  } while (load.connections > 0 || load.pendingRequestBlocks > 0 || load.eventLoopUtilization > 0.1)

  console.log(' ***** service is unloaded *****')
}

export async function sendTraffic ({ connections, requests, target }) {
  while (clients.length < connections) {
    try {
      const client = await helper.createClient({ target, protocol })

      client.node.handle(protocol, async ({ stream }) => {
        const connection = new Connection(stream)

        connection.on('data', (data) => {
          // accept any response content
          const message = Message.decode(data)
          responses += message.blockPresences.length + message.blocks.length
        })
      }, { maxInboundStreams: Infinity, maxOutboundStreams: Infinity })
      clients.push(client)
    } catch (err) {
      // console.warn('Error creating client', clients.length, 'of', connections, 'retry', err)
      await sleep(100)
    }
  }

  // split traffic equally to each connection
  const requestsPerConnections = Math.round(requests / connections)
  for (let i = 0; i < clients.length; i++) {
    clients[i].link.send(randomRequest(requestsPerConnections))
    pendings += requestsPerConnections
  }
}

export function randomRequest (size) {
  const list = []
  for (let i = 0; i < size; i++) {
    list.push(new Entry(randomCid(), 1, false, randomType(), true))
  }
  return new Message(new WantList(list, true)).encode(protocol)
}

export function randomCid () {
  const i = Math.floor(Math.random() * cids.length)
  return CID.parse(cids[i])
}

export function randomType () {
  return Math.random() > 0.5 ? Entry.WantType.Block : Entry.WantType.Have
}
