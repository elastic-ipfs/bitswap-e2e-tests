'use strict'

const fastify = require('fastify')
const { Noise } = require('@web3-storage/libp2p-noise')
const libp2p = require('libp2p')
const Multiplex = require('libp2p-mplex')
const Websockets = require('libp2p-websockets')
const { CID } = require('multiformats/cid')
const { sha256 } = require('multiformats/hashes/sha2')
const { base58btc: base58 } = require('multiformats/bases/base58')

const { loadEsmModule } = require('../lib/esm-loader')
const { Connection } = require('../lib/networking')
const { protocols, Entry, Message, WantList, RawMessage } = require('../lib/protocol')

const targets = {
  local: '/ip4/127.0.0.1/tcp/3000/ws/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei',
  prod: '/dns4/elastic.dag.house/tcp/443/wss/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm',
  staging: '/dns4/elastic-staging.dag.house/tcp/443/wss/p2p/bafzbeigjqot6fm3i3yv37wiyybsfblrlsmib7bzlbnkpjxde6fw6b4fvei',
  dev: '/dns4/elastic-dev.dag.house/tcp/443/wss/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei'
}

async function getFreePort () {
  const getPort = await loadEsmModule('get-port')
  return getPort()
}

async function startProxy ({ target, concurrency = 8, port }) {
  const PQueue = await loadEsmModule('p-queue')
  const queue = new PQueue({ concurrency: parseInt(concurrency) })
  if (!port) {
    port = await getFreePort()
  }

  const service = fastify({ logger: false })

  const proxy = await proxyPeer(target)

  service.post('/', (request, response) => {
    if (!Array.isArray(request.body.blocks)) {
      response.status(400).send('err')
      return response
    }

    response.type('application/json')

    queue.add(() => proxyRequest({ proxy, blocks: request.body.blocks, request, response }))
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
        service.close()

        // TODO BUG? looks like it's not closing
        proxy.duplex.close()
        proxy.connections.map(c => c.close())

        // TODO remove process.exit on proper connection closing
        process.exit(0)
      } catch (err) {
        console.err('ERROR on close', err)
      }
    }
  }
}

async function proxyPeer (target) {
  const node = await libp2p.create({
    modules: {
      transport: [Websockets],
      streamMuxer: [Multiplex],
      connEncryption: [new Noise()] // no need custom crypto
    }
  })

  const multiaddr = target
  const dialConnection = await node.dial(multiaddr)

  const { stream, protocol } = await dialConnection.newStream(protocols)
  const duplex = new Connection(stream)

  node.handle(protocols, ({ connection: dialConnection, stream }) => {
    const connection = new Connection(stream)
    proxy.connections.push(connection)

    connection.on('data', data => {
      proxyResponse({ data, connection })
    })

    connection.on('error', error => {
      console.error({ error }, 'connection error')
    })
  })

  const proxy = { node, duplex, protocol, connections: [] }
  return proxy
}

// pendingBlocks are never cleared because of concurrency
const pendingBlocks = new Map()
const pendingRequests = new Map()

function proxyRequest ({ proxy, blocks, request, response }) {
  // console.debug(' +++ proxyRequest', request.id)
  blocks = blocks.map(block => ({ cid: CID.parse(block.cid.trim()), type: block.type }))

  const pending = { response, data: {}, blocks: new Set() }
  // console.debug('pendingRequests.set', request.id)
  pendingRequests.set(request.id, pending)

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
    // console.debug('pendingBlocks.get', id)
    const c = pendingBlocks.get(id)
    if (c) {
      // console.debug('pendingBlocks.get - push', request.id)
      c.push(request.id)
    } else {
      // console.debug('pendingBlocks.get - set', request.id)
      pendingBlocks.set(id, [request.id])
    }
  }

  proxy.duplex.send(
    new Message(new WantList(entries, false), [], [], 0).encode(proxy.protocol)
  )
}

function proxyResponse ({ data, connection }) {
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
      prefix = 'd:'
    }
    let id = prefix + cid

    // console.debug('pendingBlocks.get', id)
    let requestIds = pendingBlocks.get(id)
    if (!requestIds) {
      if (prefix === 'i:') {
        // case for "not found" data block, which response is "i:"
        prefix = 'd:'
        id = prefix + cid
        requestIds = pendingBlocks.get(id)
      }
    }
    if (!requestIds) {
      console.error('!!! block not found in pending blocks', id)
      continue
    }

    let requestId
    while (requestIds.length > 0) {
      requestId = requestIds.shift()
      // console.debug('pendingRequests.get', requestId)
      const r = pendingRequests.get(requestId)
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
        pendingRequests.delete(requestId)
      }
    }
  }
}

function serialize (block, type) {
  return type === 'd'
    ? { data: block.data.toString('base64') }
    : { info: block.type === 0 ? 'FOUND' : 'NOT-FOUND' }
}

module.exports = {
  targets,
  startProxy
}