
import { CID } from 'multiformats/cid'
import * as helper from './helper/index.js'
import { Connection } from './lib/networking.js'
import { BITSWAP_V_120, Entry, Message, WantList } from './lib/protocol.js'

const TARGET_ENV = process.env.TARGET_ENV ?? 'local'
const protocol = BITSWAP_V_120

async function test (cid, type) {
  cid = CID.parse(cid)
  type = type === 'data' ? Entry.WantType.Block : Entry.WantType.Have

  console.log('creating peer client ...')
  console.log(`target: ${helper.targets[TARGET_ENV]}\n  protocol: ${protocol}`)
  console.time('connected')
  const client = await helper.createClient({
    target: helper.targets[TARGET_ENV],
    protocol
  })
  console.log('client connected.')
  console.timeEnd('connected')

  const handlerOptions = {
    maxInboundStreams: Infinity,
    maxOutboundStreams: Infinity
  }

  client.node.handle(protocol, async ({ stream }) => {
    const connection = new Connection(stream)

    connection.on('data', async data => {
      console.log('\n\n>>> response')
      const message = Message.decode(data)

      console.log('***')
      console.info(helper.printResponse(message))
      console.log('***')
      console.timeEnd('response')

      end(client)
    })
  }, handlerOptions)

  console.log(`sending request ${cid.toString()} ${type === Entry.WantType.Block ? 'WantType.Block' : 'WantType.Have'} ...`)
  console.time('response')
  client.link.send(
    new Message(
      new WantList(
        [new Entry(cid, 1, false, type, true)], true
      )
    ).encode(protocol)
  )
}

function end (client) {
  client.node.stop()
  client.connection.close()
  client.link.close()
  client.stream.close()

  console.log('--- done')
}

test(process.argv[2], process.argv[3])
