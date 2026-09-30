# Live Splits

A Split lives in one Durable Object that `wrangler dev` runs beside the site. `POST /api/splits` creates a Split and returns its id and the creator secret. Every client that opens the WebSocket at `/parties/split-server/<id>` gets the Split's state, and each Claim one client sends reaches every other client as the new state. Until the Split screen ships, no page opens that socket, so these proofs drive WebSocket clients from Node with `tools/live-clients.mjs`.

## Sub-features

- `live-create` creates a Split through `POST /api/splits` with the Turnstile test token.
- `live-two-clients` shows each client the other's Claims, with the same state on both after every Claim.
- `live-hibernate` wakes the Durable Object from hibernation when a Claim arrives after an idle minute, and delivers it to every client.
- `live-reconnect` gives a client that left and came back the Claims it missed.
- `live-cap` refuses the operation that would push the Split over 32 KB and keeps the stored state.
- `live-perf` measures the round trip from a Claim sent by one client to the state received by another.

## How to get to it (user POV)

- The Host creates a Split, which posts the Receipt to `POST /api/splits`.
- Each Participant opens the Split link, and the page opens the WebSocket at `/parties/split-server/<id>`. Until the Split screen ships, Node clients stand in for these pages.

## Driving it with verify.mjs

Preconditions:

- `verify.mjs doctor --port 8811` reports `"ok":true`. `.dev.vars` gives `wrangler dev` the Turnstile test secret `1x0000000000000000000000000000000AA`, so the test token `XXXX.DUMMY.TOKEN.XXXX` passes siteverify. The machine needs network access to `challenges.cloudflare.com`.
- `<out>` is the lane's output folder, as defined in [README.md](./README.md).
- `live-clients` means `node tools/live-clients.mjs`. Every command prints one JSON line with `"ok"` on stdout and exits 0 on success, and writes its transcript to stderr. `--log <file>` saves the report and the transcript. Without `--id`, each command creates a fresh Split first.

- **Create.** Run `live-clients create --port 8811`. The line has `"ok":true`, a 22-character `id`, and a 43-character `creatorSecret`. `grep -ciE "error|exception" .verify/8811/wrangler.log` prints `0`, and the log shows `POST /api/splits 201 Created`.
- **Two clients.** Run `live-clients claims --port 8811 --claims 6 --pace-ms 100 --log <out>/server-two-clients.json`, then `live-clients render --in <out>/server-two-clients.json --shot <out>/server-two-clients.png`. The clients take turns to Claim, so each receives the other's Claims. The line has `"sameStateAfterEveryClaim":true` and `"finalRevision":6`.
- **Several clients.** Add `--clients <n>` to `claims` or `idle` to open more clients on one Split. They connect one after another and each prints a `connected` event.
- **Hibernation.** Note the line count of `.verify/8811/wrangler.log`, then run `live-clients idle --port 8811 --clients 3 --idle-s 60 --log <out>/server-hibernate.json`. The line has `"ok":true` and every client at the same revision. The log lines after your note show `SplitServer <id> woke from hibernation with 3 open sockets`. To save `server-hibernate.png`, put those lines and the report in one text file and render it with `live-clients render --in <file> --shot <out>/server-hibernate.png`.
- **Reconnect.** Run `live-clients drop --port 8811 --drop-s 10 --log <out>/server-reconnect.json` and render it to `<out>/server-reconnect.png`. Client 1 closes its socket, client 0 Claims the pitcher, and after 10 seconds client 1 opens a new socket. The line has `"claimedBy":["ann"]` and the revision client 0 saw.
- **32 KB cap.** Run `live-clients cap --port 8811 --log <out>/server-cap.json` and render it to `<out>/server-cap.png`. The client adds Items with long names until one is refused. The line has `"rejection":{"reason":"tooLarge"}`, `acceptedBytes` just under 32768, and a fresh client that sees the last accepted state unchanged.
- **Perf.** Run `live-clients claims --port 8811 --claims 200 --pace-ms 60 --log <out>/claims-200.json`. The line reports `p50Ms`, `p95Ms`, and `maxMs`, and `"ok"` is false when `p95Ms` is over 150. Then run `grep -rnE "setInterval|setTimeout|ws\.accept\(" worker/`, which must print nothing.

## Gotchas

- Each Split allows a burst of 60 operations and then 20 a second. Unpaced scripts get `rateLimited` rejections, so keep `--pace-ms` at 50 or more for long runs.
- Each IP may create 10 Splits a minute. A lane that runs more than 10 commands without `--id` in a minute gets 429 from `POST /api/splits`. Pass `--id` from an earlier `create` to reuse a Split.
- `drop` closes the socket cleanly. It proves that a reconnect gets the missed state, not how a phone's client library notices a lost network.
- `cleanup` deletes `.verify/<port>/`, including the Durable Object storage, so Splits do not survive a relaunch.
- The socket path answers 404 without an upgrade header and for any id that is not 22 characters of letters, digits, `_`, and `-`. A curl on the path is not a proof.
