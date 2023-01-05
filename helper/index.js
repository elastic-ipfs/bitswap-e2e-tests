
import fastify from 'fastify'
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { base58btc as base58 } from 'multiformats/bases/base58'
import getPort from 'get-port'
import PQueue from 'p-queue'

import { Connection } from '../lib/networking.js'
import { BITSWAP_V_120 as protocol, Entry, Message, WantList, RawMessage, BlockPresence } from 'e-ipfs-core-lib'

const targets = {
  local: '/ip4/127.0.0.1/tcp/3000/ws/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei',
  prod: '/dns4/elastic.dag.house/tcp/443/wss/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm',
  staging: '/dns4/elastic-staging.dag.house/tcp/443/wss/p2p/bafzbeigjqot6fm3i3yv37wiyybsfblrlsmib7bzlbnkpjxde6fw6b4fvei',
  dev: '/dns4/elastic-dev.dag.house/tcp/443/wss/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei'
}

// pendingBlocks are never cleared because of concurrency
const pendingBlocks = {}
const pendingRequests = {}

function debug (...args) {
  // TODO doc
  if (!process.env.DEBUG) { return }
  console.info(...args)
}

// the proxy server is intended to run only for testing, not to be an ongoing service
async function startProxy ({ target, concurrency = 8, port, name = 'default' }) {
  const queue = new PQueue({ concurrency: parseInt(concurrency) })
  if (!port) {
    port = await getPort()
  }

  pendingBlocks[name] = new Map()
  pendingRequests[name] = new Map()
  const service = fastify({ logger: false })

  const proxy = await proxyPeer({ target, name, protocol })

  service.post('/', (request, response) => {
    if (!Array.isArray(request.body.blocks)) {
      response.status(400).send('err')
      return response
    }

    response.type('application/json')

    queue.add(() => proxyRequest({ proxy, blocks: request.body.blocks, request, response, name }))
  })

  await service.listen({ port })

  console.log(` *** proxy server is ready @ ${port} for ${target} ***`)

  return {
    url: `http://localhost:${port}`,
    request: {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      path: '/'
    },
    close: async () => {
      try {
        // close all the open connections
        service.close()
        proxy.link.close()
        proxy.connections.map(c => c.close())
        proxy.node.stop()
        proxy.connection.close()
      } catch (err) {
        console.err('ERROR on close', err)
      }
    }
  }
}

async function proxyPeer ({ target, name, protocol }) {
  const node = await createP2pNode()

  const connection = await node.dial(target)
  const stream = await connection.newStream(protocol)
  const link = new Connection(stream)

  const options = {
    maxInboundStreams: Infinity,
    maxOutboundStreams: Infinity
  }

  node.handle(protocol, ({ stream }) => {
    const connection = new Connection(stream)
    proxy.connections.push(connection)

    connection.on('data', data => {
      proxyResponse({ data, connection, name })
    })

    connection.on('error', error => {
      console.error({ error }, 'connection error')
    })
  }, options)

  const proxy = { node, link, protocol, connections: [], connection }
  return proxy
}

function proxyRequest ({ proxy, blocks, request, response, name }) {
  debug(' +++ proxyRequest', request.id)
  blocks = blocks.map(block => ({ cid: CID.parse(block.cid.trim()), type: block.type }))

  const pending = { response, data: {}, blocks: new Set() }
  debug('pendingRequests.set', request.id)
  pendingRequests[name].set(request.id, pending)

  const entries = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const cid = block.cid
    let id
    if (block.type === 'd') {
      id = 'd:' + cid
      entries.push(new Entry(cid, 1, false, Entry.WantType.Block, true))
    } else {
      id = 'i:' + cid
      entries.push(new Entry(cid, 1, false, Entry.WantType.Have, true))
    }

    pending.blocks.add(id)
    debug('pendingBlocks.get', id)
    const c = pendingBlocks[name].get(id)
    if (c) {
      debug('pendingBlocks.get - push', request.id)
      c.push(request.id)
    } else {
      debug('pendingBlocks.get - set', request.id)
      pendingBlocks[name].set(id, [request.id])
    }
  }

  proxy.link.send(
    new Message(new WantList(entries, false), [], [], 0).encode(proxy.protocol)
  )
}

function proxyResponse ({ data, connection, name }) {
  const message = RawMessage.decode(data)
  const blocks = message.blocks.map(block => ({ type: 'i', block }))
    .concat(message.blockPresences.map(block => ({ type: 'i', block })))
    .concat(message.payload.map(block => ({ type: 'd', block })))

  for (let i = 0; i < blocks.length; i++) {
    const { type, block } = blocks[i]
    let cid, prefix
    if (type === 'i') {
      cid = base58.encode(block.cid)
      if (cid[0] === 'z') { cid = cid.substring(1) }
      prefix = 'i:'
    } else {
      cid = CID.create(block.prefix[0], block.prefix[1], sha256.digest(block.data)).toString()
      // if (cid.startsWith('Qm')) {                cid = 'z' + cid      }
      prefix = 'd:'
    }
    let id = prefix + cid

    debug('pendingBlocks.get', id)
    let requestIds = pendingBlocks[name].get(id)
    if (!requestIds) {
      if (prefix === 'i:') {
        // case for "not found" data block, which response is "i:"
        prefix = 'd:'
        id = prefix + cid
        requestIds = pendingBlocks[name].get(id)
      }
    }
    if (!requestIds) {
      // console.log(pendingBlocks[name].values())
      console.error('!!! block not found in pending blocks', id)
      continue
    }

    let requestId
    while (requestIds.length > 0) {
      requestId = requestIds.shift()
      debug('pendingRequests.get', requestId)
      const r = pendingRequests[name].get(requestId)
      if (!r) {
        console.error('!!! request not found for block', { requestId, id })
        continue
      }

      if (!r.blocks.delete(id)) {
        // is it possible?
        console.error('!!! block not in request', { requestId, id })
      }

      // TODO stream instead?
      r.data[cid] = serialize(block, type)

      if (r.blocks.size < 1) {
        r.response.send(JSON.stringify(r.data))
        pendingRequests[name].delete(requestId)
      }
    }
  }
}

function serialize (block, type) {
  return type === 'd'
    ? { data: Buffer.from(block.data).toString('base64') }
    : { info: block.type === 0 ? 'FOUND' : 'NOT-FOUND' }
}

function printResponse (message) {
  const out = {
    wantlist: message.wantlist,
    blocks: message.blocks.map(b => ({
      prefix: '[base64] ' + Buffer.from(b.prefix).toString('base64'),
      data: '[base64] ' + Buffer.from(b.data).toString('base64').substring(0, 80) + '...',
      '_data.length': b.data.length
    })),
    blockPresences: message.blockPresences.map(b => ({
      cid: b.cid.toString(),
      type: b.type === BlockPresence.Type.Have ? 'BlockPresence.Type.Have' : 'BlockPresence.Type.DontHave'
    })),
    pendingBytes: message.pendingBytes,
    blocksSize: message.blocksSize
  }

  return JSON.stringify(out, null, 2)
}

async function createClient ({ target, protocol }) {
  const node = await createP2pNode()
  const connection = await node.dial(target)
  const stream = await connection.newStream(protocol)
  const link = new Connection(stream)

  return { node, connection, link, stream }
}

function endClient (client) {
  client.node.stop()
  client.connection.close()
  client.link.close()
  client.stream.close()
}

async function createP2pNode () {
  const node = await createLibp2p({
    transports: [webSockets()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex({
      maxInboundStreams: Infinity,
      maxOutboundStreams: Infinity,
      maxStreamBufferSize: Infinity,
      disconnectThreshold: Infinity
    })],
    connectionManager: {
      maxConnections: Infinity,
      minConnections: 0,
      pollInterval: 30000,
      inboundConnectionThreshold: Infinity,
      maxIncomingPendingConnections: Infinity,
      inboundUpgradeTimeout: 30000,
      autoDial: false,
      autoDialInterval: 30000
    }
  })
  await node.start()
  return node
}

export {
  targets,
  startProxy,
  printResponse,
  createClient,
  endClient
}
