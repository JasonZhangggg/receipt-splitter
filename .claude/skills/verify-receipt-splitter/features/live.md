# Live Splits

A Split lives in one Durable Object that `wrangler dev` runs beside the site. `POST /api/splits` creates a Split and returns its id and the creator secret. Every client that opens the WebSocket at `/parties/split-server/<id>` gets the Split's state, and each Claim one client sends reaches every other client as the new state. The home page and the Split page open that socket, as [join.md](./join.md) describes. These proofs drive many clients at once from Node with `live-clients.mjs` in this skill folder.

## Sub-features

- `live-create` creates a Split through `POST /api/splits`.
- `live-two-clients` shows each client the other's Claims, with the same state on both after every Claim.
- `live-hibernate` wakes the Durable Object from hibernation when a Claim arrives after an idle minute, and delivers it to every client.
- `live-reconnect` gives a client that left and came back the Claims it missed.
- `live-cap` refuses the operation that would push the Split over 32 KB and keeps the stored state.
- `live-seed` loads a golden row from `src/core/golden/` into a local Split, so an older or newer stored shape opens in the browser.
- `live-perf` measures the round trip from a Claim sent by one client to the state received by another.

## How to get to it (user POV)

- The Host creates a Split, which posts the Receipt to `POST /api/splits`.
- Each Participant opens the Split link, and the page opens the WebSocket at `/parties/split-server/<id>`. Node clients stand in for many pages at once.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).
- `live-clients` means `node .claude/skills/verify-receipt-splitter/live-clients.mjs`. Every command prints one JSON line with `"ok"` on stdout and exits 0 on success, and writes its transcript to stderr. `--log <file>` saves the report and the transcript. Without `--id`, each command creates a fresh Split first.

- **Create.** Run `live-clients create --port 8811`. The line has `"ok":true`, a 22-character `id`, and a 43-character `creatorSecret`. `grep -ciE "error|exception" .verify/8811/wrangler.log` prints `0`, and the log shows `POST /api/splits 201 Created`.
- **Two clients.** Run `live-clients claims --port 8811 --claims 6 --pace-ms 100 --log <out>/server-two-clients.json`, then `live-clients render --in <out>/server-two-clients.json --shot <out>/server-two-clients.png`. Each client in turn Claims the fries and then unclaims them, so every client receives a Claim and an unclaim from another. The line has `"sameStateAfterEveryClaim":true`, `"everyClientReceivedBoth":true`, and `"finalRevision":6`. `received` counts what each client saw. With fewer than two Claims per client, `everyClientReceivedBoth` is false.
- **Several clients.** Add `--clients <n>` to `claims` or `idle` to open more clients on one Split. They connect one after another and each prints a `connected` event.
- **Hibernation.** Note the line count of `.verify/8811/wrangler.log`, then run `live-clients idle --port 8811 --clients 3 --idle-s 60 --log <out>/server-hibernate.json`. The line has `"ok":true` and every client at the same revision. The log lines after your note show `SplitServer <id> woke from hibernation with 3 open sockets`. To save `server-hibernate.png`, put those lines and the report in one text file and render it with `live-clients render --in <file> --shot <out>/server-hibernate.png`.
- **Reconnect.** Run `live-clients drop --port 8811 --drop-s 10 --log <out>/server-reconnect.json` and render it to `<out>/server-reconnect.png`. Client 1 closes its socket, client 0 Claims the pitcher, and after 10 seconds client 1 opens a new socket. The line has `"claimedBy":["ann"]` and the revision client 0 saw.
- **32 KB cap.** Run `live-clients cap --port 8811 --log <out>/server-cap.json` and render it to `<out>/server-cap.png`. The client adds Items with long names until one is refused. The line has `"rejection":{"reason":"tooLarge"}`, `acceptedBytes` just under 32768, and a fresh client that sees the last accepted state unchanged.
- **Seed a golden row.** Run `live-clients create --port 8811` and keep its `id`. Then run `node .claude/skills/verify-receipt-splitter/seed.mjs --port 8811 --id <id> --row src/core/golden/v2-1.json`. It writes that golden row, under the new `id`, into the Split's Durable Object storage in `.verify/8811/state/`, while wrangler keeps running. The line has `"ok":true` and the row's `schemaVersion`. The next socket or page that opens `/s/<id>` loads the seeded row. Seed only right after `create`, before any socket or page opens `/s/<id>`. A Durable Object that is already awake keeps the Split it holds in memory and does not read the seed. Any file in `src/core/golden/` works the same way.
- **Perf.** Run `live-clients claims --port 8811 --claims 200 --pace-ms 60 --log <out>/claims-200.json`. The line reports `p50Ms`, `p95Ms`, and `maxMs`, and `"ok"` is false when `p95Ms` is over 150. Then run `grep -rnE "setInterval|setTimeout|ws\.accept\(" worker/`, which must print nothing.

## Gotchas

- Each Split allows a burst of 60 operations and then 20 a second. Unpaced scripts get `rateLimited` rejections, so keep `--pace-ms` at 50 or more for long runs. Each `rateLimited` reply carries `retryAfterMs`. A frame sent before that wait ends is early. The 100th early frame since the socket's last admitted frame gets its reply, and then the socket is closed with code 1008, so a pure flood closes at frame 101. A client that waits out `retryAfterMs` is never closed. Recorded changes, the ones Undo can reverse, also share a history rate of 5 KB at once and then 1 KB a second per Split. A change over it gets `rateLimited` with its own ref, which is not early.
- Each IP may create 10 Splits a minute. A lane that runs more than 10 commands without `--id` in a minute gets 429 from `POST /api/splits`. Pass `--id` from an earlier `create` to reuse a Split.
- `drop` closes the socket cleanly. It proves that a reconnect gets the missed state, not how a phone's client library notices a lost network.
- `cleanup` deletes `.verify/<port>/`, including the Durable Object storage, so Splits do not survive a relaunch.
- The socket path answers 404 without an upgrade header and for any id that is not 22 characters of letters, digits, `_`, and `-`. A curl on the path is not a proof.
