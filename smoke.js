
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
  const client = await helper.createClient({
    target: helper.targets[TARGET_ENV],
    protocol
  })
  console.log('client connected.')

  client.node.handle(protocol, async ({ stream }) => {
    const connection = new Connection(stream)

    connection.on('data', async data => {
      console.log('\n\n>>> response')
      const message = Message.decode(data)

      console.log('***')
      console.info(helper.printResponse(message))
      console.log('***')

      end(client)
    })
  })

  console.log(`sending request ${cid.toString()} ${type === Entry.WantType.Block ? 'WantType.Block' : 'WantType.Have'} ...`)
  client.connection.send(
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

  console.log('--- done')

  process.exit(0)
}

test(process.argv[2], process.argv[3])
