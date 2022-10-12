'use strict'

const path = require('path')

const { Table } = require('console-table-printer')
const byteSize = require('byte-size')
const op = require('object-path')

const items = [
  { path: 'connections', um: 'unit' },
  { path: 'samples', um: 'unit' },
  { path: 'duration', um: 'unit' },
  { path: 'errors', um: 'unit' },
  { path: 'timeouts', um: 'unit' },
  { path: '1xx', um: 'unit' },
  { path: '2xx', um: 'unit' },
  { path: '3xx', um: 'unit' },
  { path: '4xx', um: 'unit' },
  { path: '5xx', um: 'unit' }
]
for (const group of [
  { key: 'latency', um: 'ms', reverse: true },
  { key: 'requests', um: 'unit' },
  { key: 'throughput', um: 'bytes' }
]) {
  items.push({ path: `${group.key}.average`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.mean`, um: group.um, reverse: group.reverse })
  items.push({ path: `${group.key}.min`, um: group.um, reverse: group.reverse })
  items.push({ path: `${group.key}.max`, um: group.um, reverse: group.reverse })
  items.push({ path: `${group.key}.stddev`, compare: false, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p0_001`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p0_01`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p0_1`, um: group.um, reverse: group.reverse })
  items.push({ path: `${group.key}.p1`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p2_5`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p10`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p25`, um: group.um, reverse: group.reverse })
  items.push({ path: `${group.key}.p50`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p75`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p90`, um: group.um, reverse: group.reverse })
  items.push({ path: `${group.key}.p97_5`, um: group.um, reverse: group.reverse })
  items.push({ path: `${group.key}.p99`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p99_9`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p99_99`, um: group.um, reverse: group.reverse })
  // items.push({ path: `${group.key}.p99_999`, um: group.um, reverse: group.reverse })
}

// TODO env vars
const LABEL1 = 'test #1'
const LABEL2 = 'test #2'

async function main(resultFile1, resultFile2) {
  const result1 = require(path.join(process.cwd(), resultFile1))
  const result2 = require(path.join(process.cwd(), resultFile2))

  for (const test of Object.keys(result1)) {
    // TODO if(!result2[test])
    const r1 = result1[test]
    const r2 = result2[test]

    const compare = []
    for (const i of items) {
      const v1 = op.get(r1, i.path)
      const v2 = op.get(r2, i.path)
      compare.push({
        path: i.path,
        v1,
        v2,
        value: i.compare === false ? null : diff(v1, v2),
        um: i.um,
        reverse: i.reverse,
        compare: i.compare !== false
      })
    }

    console.log('\n\n *** ' + test + ' ***\n')
    print(compare)
  }
}

function print(compare) {
  const p = new Table()

  for (const row of compare) {
    p.addRow({
      measure: row.path,
      diff: row.compare ? format(row.value) : '',
      [LABEL1]: value(row.v1, row.um),
      [LABEL2]: value(row.v2, row.um)
    }, { color: color(row.value, row.reverse, row.compare) })
  }

  p.printTable()
}

function color(v, reverse, compare = true) {
  if (v === 0 || !compare) {
    return 'white'
  }

  if(reverse) {
    return v > 0 ? 'red' : 'green'
  }

  return v > 0 ? 'green' : 'red'
}

function diff(v1, v2) {
  if (v1 === v2) {
    return 0
  }
  return 100 - (v1 / v2 * 100)
}

function format(v) {
  if (v === 0) {
    return '='
  }

  if (v > 0) {
    return '+ ' + v.toFixed(2) + ' %'
  }

  return '- ' + (v*-1).toFixed(2) + ' %'
}

function value(v, um) {
  if (um === 'unit') { return v }
  if (um === 'ms') { return v + ' ms' }
  if (um === 'bytes') { return v ? byteSize(v) : '-' }
  return v + um
}

main(process.argv[2], process.argv[3])
