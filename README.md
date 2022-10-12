# Elastic IPFS e2e test suite

The `Elastic IPFS` e2e test suite provides a set of tools for e2e testing.

## e2e testing `bitswap-peer` service

There are 2 tests for `bitswap-peer`: `regression` and `load`.  
One of the main capabilities of the bitswap peer is concurrency, so in order to test the correctness of the service, we need to test under concurrent requests.  
The test stack is composed of `autocannon` and the `http-proxy`, built on top of `libp2p`, which means that every time the test run, an `http-proxy` instance is setup to target a `bitswap-peer` service or a cluster.

### How to run tests

Install node deps, please note node `v18` is required.

```bash
npm i
```

TODO npm auth

Then run

```bash
npm run test:regression
```

or

```bash
npm run test:load
```

#### bench

To compare performance of test (usually on different version of the service) you can run the `bench` script on the targets, get the results, the run the `compare` script to visualize the difference.

```bash
./bench/bench.sh $label
```

use env vars for bench too

```bash
TARGET_ENV=dev ./bench/bench.sh current
TARGET_ENV=dev ./bench/bench.sh next
```

then compare results

```bash
node compare-results.js result/current-regression-1.json result/next-regression-1.json
node compare-results.js result/current-regression-2.json result/next-regression-2.json
node compare-results.js result/current-load-1.json result/next-load-2.json
node compare-results.js result/current-load-2.json result/next-load-2.json
```

---

### Regression test

The purpose of the regression test is to assert the correctness of responses.  
The default options will run a regression test against the local `bitswap-peer` service assuming it's pointing to `dev` storage.

#### Options

- **TARGET_ENV** (default `local`)

See [targets](#targets)

- **TEST_ENV** (default `dev`)

The test scenarios to load, are defined in the `/snaps` folder; currently supported values: `dev`, `staging`.

- **UPDATE_SNAPS** (default `false`)

Update snaps, instead of asserting.

- **ONLY**

Run the test with only the specific snap file, for example, `ONLY=single-block-data.json`

- **VERBOSE** (default `false`)

Enable verbosity on assertions.

#### Examples

Run in local with dev scenario (for local development)

```bash
npm run test:regression
```

Run in dev with dev scenario (for dev testing)

```bash
TARGET_ENV=dev npm run test:regression
```

Run in staging with staging scenario (for staging testing)

```bash
TARGET_ENV=staging TEST_ENV=staging npm run test:regression
```

Update results for single-block-data.json

```bash
ONLY=single-block-data.json TARGET_ENV=dev UPDATE_SNAPS=1 npm run test:regression
```

Run test only for single-block-data.json and add verbosity

```bash
ONLY=single-block-data.json TARGET_ENV=dev VERBOSE=1 npm run test:regression
```

---

### Load test

The purpose of the regression test is to assert the system can handle a huge peek of traffic.  
Note that the test expects the service to respond, but it doesn't assert the correctness of such responses.  
The default options will run a load test against the local `bitswap-peer` service assuming it's pointing to `dev` storage.

#### Options

- **TARGET_ENV** (default `local`)

See [targets](#targets)

- **TEST_ENV** (default `dev`)

The test scenarios to load, are defined in the `/snaps` folder; currently supported values: `dev`, `staging`.

- **TEST_CONNECTIONS** (default `1k`)

Concurrent connections for `autocannon`.

- **TEST_DURATION** (default `60 secs`)

Test duration, in seconds - so it will run N connections for X seconds.

- **TEST_TIMEOUT** (default `5 mins`)

Timeout for each response, in seconds.

- **TEST_AMOUNT**

It overrides `duration`.

#### Examples

Run in local with dev scenario (for local development)

```bash
npm run test:load
```

Run in dev with dev scenario (for dev testing)

```bash
TARGET_ENV=dev npm run test:load
```

Run in staging with staging scenario (for staging testing)

```bash
TARGET_ENV=staging TEST_ENV=staging npm run test:load
```

Override default connections and durations

```bash
TARGET_ENV=dev TEST_CONNECTIONS=100 TEST_DURATION=60 npm run test:load
```

Override default durations by the amount of requests

```bash
TARGET_ENV=dev TEST_CONNECTIONS=100 TEST_AMOUNT=100 npm run test:load
```

### Targets

The test target; possible values are `local`, `dev`, `staging`, and `prod` that point as following

```txt
local    /ip4/127.0.0.1/tcp/3000/ws/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei
dev      /dns4/elastic-dev.dag.house/tcp/443/wss/p2p/bafzbeia6mfzohhrwcvr3eaebk3gjqdwsidtfxhpnuwwxlpbwcx5z7sepei
staging  /dns4/elastic-staging.dag.house/tcp/443/wss/p2p/bafzbeigjqot6fm3i3yv37wiyybsfblrlsmib7bzlbnkpjxde6fw6b4fvei
prod     /dns4/elastic.dag.house/tcp/443/wss/p2p/bafzbeibhqavlasjc7dvbiopygwncnrtvjd2xmryk5laib7zyjor6kf3avm
```

---

### http proxy

The `http-proxy` provides an http interface to the `bitswap-peer` to be able to use common http tools for testing and benchmarks, allowing to send requests (and get responses) by http instead of the `libp2p` protocol (over `websocket`) - that is was the `http-proxy` service actually does.

#### how to use proxy

The test scripts

Then you can query it using http tools, for example, `curl` and `autocannon`

using curl

```bash
curl -X POST -H "Content-Type: application/json" \
-d '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"}]}' \
http://localhost:3002/
```

with autocannon

```bash
npx autocannon -m POST \
-H "Content-Type":"application/json" \
-b '{"blocks": [{"type":"i","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"i","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"},{"type":"d","cid":"QmUGsfJPhJ6CLuvnvcdvJH5jc7Yxf19pSD1jRn9wbsPCBY"},{"type":"d","cid":"QmRT1kpMn7ANggwsf31zVuXNUNwpHqt3u7DfKhEbtbftbM"}]}' \
http://localhost:3002/
```

## Acknowledgements

The "setup" stage before running the tests is missing, we assume data are already present in the target system - which is a **bad testing practice**.
