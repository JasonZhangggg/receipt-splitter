#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const USAGE = `usage: tools/live-clients.mjs <create|claims|idle|drop|cap|render> --port <port> [options]
  create                      create a Split with the Turnstile test token and print { id, creatorSecret }
  claims --claims 200 --pace-ms 60 --clients 2
                              clients take turns to Claim and unclaim; reports the round trip until the next client sees each new state
  idle --clients 3 --idle-s 60
                              opens clients, waits, then client 0 Claims; every client must receive it
  drop --drop-s 10            client 1 closes, client 0 Claims, client 1 reconnects and must see the Claim
  cap                         adds Items until the Split nears 32 KB and one is refused; the stored state must not change
  render --in <log.json> --shot <file.png>
                              renders a transcript written with --log as a screenshot
common: --id <split id> (default: create one), --log <file.json> (write the transcript)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string" },
    id: { type: "string" },
    clients: { type: "string" },
    claims: { type: "string", default: "200" },
    "pace-ms": { type: "string", default: "60" },
    "idle-s": { type: "string", default: "60" },
    "drop-s": { type: "string", default: "10" },
    log: { type: "string" },
    in: { type: "string" },
    shot: { type: "string" },
  },
});

const command = positionals[0];
const transcript = [];

function note(event) {
  const line = { at: new Date().toISOString(), ...event };
  transcript.push(line);
  console.error(JSON.stringify(line));
}

function finish(result) {
  const report = { command, ...result };
  if (values.log) writeFileSync(values.log, JSON.stringify({ report, transcript }, null, 2));
  console.log(JSON.stringify(report));
  process.exit(report.ok ? 0 : 1);
}

function fail(error) {
  finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
}

const base = () => {
  if (!values.port) throw new Error(`--port is required\n${USAGE}`);
  return `localhost:${values.port}`;
};

async function createSplit() {
  const response = await fetch(`http://${base()}/api/splits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
      split: {
        receipt: {
          items: [
            { id: "fries", name: "Fries", price: 800 },
            { id: "pitcher", name: "Pitcher", price: 3000 },
          ],
          adjustments: [{ id: "tax", kind: "tax", name: "Tax", amount: 337 }],
          subtotal: 3800,
          total: 4137,
        },
        participants: [{ id: "ann", name: "Ann" }],
        paymentHandles: [{ service: "venmo", handle: "ann-host" }],
      },
    }),
  });
  const body = await response.json();
  note({ event: "create", status: response.status, body: { id: body.id, refused: body.refused } });
  if (response.status !== 201) throw new Error(`create returned ${response.status} ${JSON.stringify(body)}`);
  return body;
}

class Client {
  constructor(name, id) {
    this.name = name;
    this.id = id;
    this.states = [];
    this.waiters = [];
  }

  open() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(`ws://${base()}/parties/split-server/${this.id}`);
      this.socket.addEventListener("message", ({ data }) => this.#receive(JSON.parse(data), performance.now()));
      this.socket.addEventListener("error", () => reject(new Error(`${this.name} could not connect`)));
      this.socket.addEventListener("close", ({ code }) => note({ event: "closed", client: this.name, code }));
      this.#next((message) => message.type === "state").then(resolve, reject);
    });
  }

  close() {
    this.socket.close(1000, "client left");
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  get split() {
    return this.states.at(-1);
  }

  waitFor(test) {
    return this.#next(test);
  }

  #next(test) {
    return new Promise((resolve) => this.waiters.push({ test, resolve }));
  }

  #receive(message, at) {
    if (message.type === "state") this.states.push(message.split);
    const index = this.waiters.findIndex(({ test }) => test(message));
    if (index !== -1) this.waiters.splice(index, 1)[0].resolve({ message, at });
  }
}

async function openClients(id, count) {
  const clients = Array.from({ length: count }, (_, index) => new Client(`client-${index}`, id));
  for (const client of clients) {
    await client.open();
    note({ event: "connected", client: client.name, revision: client.split.revision });
  }
  return clients;
}

const claim = (ref, itemId, claimed) => ({
  ref,
  op: { type: claimed ? "claim" : "unclaim", by: "ann", itemId, participantId: "ann" },
});

function converged(clients) {
  const [first, ...rest] = clients.map((client) => JSON.stringify(client.split));
  return rest.every((json) => json === first);
}

async function claimAndWatch(clients, ref, claimed) {
  const [sender, ...others] = clients;
  const target = sender.split.revision + 1;
  const seen = others.map((client) => client.waitFor((message) => message.type === "state" && message.split.revision === target));
  const answer = sender.waitFor((message) => message.ref === ref);
  const sentAt = performance.now();
  sender.send(claim(ref, "fries", claimed));
  const reply = await answer;
  if (reply.message.type !== "state") throw new Error(`${ref} was answered ${JSON.stringify(reply.message)}`);
  const arrivals = await Promise.all(seen);
  return { roundTripMs: arrivals[0].at - sentAt, revision: target };
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function splitId() {
  return values.id ?? (await createSplit()).id;
}

const commands = {
  async create() {
    const created = await createSplit();
    return { ok: true, id: created.id, creatorSecret: created.creatorSecret };
  },

  async claims() {
    const id = await splitId();
    const clients = await openClients(id, Number(values.clients ?? 2));
    const count = Number(values.claims);
    const times = [];
    let divergedAfter = null;
    for (let index = 0; index < count; index += 1) {
      const turn = index % clients.length;
      const rotated = [...clients.slice(turn), ...clients.slice(0, turn)];
      const { roundTripMs, revision } = await claimAndWatch(rotated, `c${index}`, index % 2 === 0);
      times.push(roundTripMs);
      if (divergedAfter === null && !converged(clients)) divergedAfter = revision;
      if (count <= 20) note({ event: "claim seen by every client", sender: rotated[0].name, revision, roundTripMs, fries: clients.map((client) => client.split.receipt.items[0].claimedBy) });
      await sleep(Number(values["pace-ms"]));
    }
    const sorted = [...times].sort((a, b) => a - b);
    const round = (ms) => Math.round(ms * 100) / 100;
    const result = {
      id,
      claims: count,
      p50Ms: round(percentile(sorted, 50)),
      p95Ms: round(percentile(sorted, 95)),
      maxMs: round(sorted.at(-1)),
      finalRevision: clients[0].split.revision,
      sameStateAfterEveryClaim: divergedAfter === null,
    };
    note({ event: "claims", ...result });
    clients.forEach((client) => client.close());
    return { ok: result.sameStateAfterEveryClaim && result.p95Ms <= 150, ...result };
  },

  async idle() {
    const id = await splitId();
    const clients = await openClients(id, Number(values.clients ?? 3));
    const idleS = Number(values["idle-s"]);
    note({ event: "idle", seconds: idleS });
    await sleep(idleS * 1000);
    const { roundTripMs, revision } = await claimAndWatch(clients, "after-idle", true);
    const everyone = clients.map((client) => ({ client: client.name, revision: client.split.revision }));
    note({ event: "claim after idle", roundTripMs, everyone });
    clients.forEach((client) => client.close());
    return { ok: converged(clients) && everyone.every((seen) => seen.revision === revision), id, idleS, everyone };
  },

  async drop() {
    const id = await splitId();
    const [sender, dropped] = await openClients(id, 2);
    dropped.close();
    note({ event: "dropped", client: dropped.name, seconds: Number(values["drop-s"]) });
    const answer = sender.waitFor((message) => message.ref === "while-dropped");
    sender.send(claim("while-dropped", "pitcher", true));
    const { message } = await answer;
    note({ event: "claimed while dropped", revision: message.split.revision });
    await sleep(Number(values["drop-s"]) * 1000);
    const back = new Client("client-1-reconnected", id);
    await back.open();
    const claimedBy = back.split.receipt.items.find(({ id: itemId }) => itemId === "pitcher").claimedBy;
    note({ event: "reconnected", client: back.name, revision: back.split.revision, pitcherClaimedBy: claimedBy });
    sender.close();
    back.close();
    return { ok: back.split.revision === message.split.revision && claimedBy.includes("ann"), id, revision: back.split.revision, claimedBy };
  },

  async cap() {
    const id = await splitId();
    const [client] = await openClients(id, 1);
    const name = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}".repeat(20);
    let accepted = client.split;
    let refusal = null;
    for (let index = 0; refusal === null; index += 1) {
      const ref = `add${index}`;
      const answer = client.waitFor((message) => message.ref === ref);
      client.send({
        ref,
        op: { type: "editReceipt", by: null, items: [{ type: "add", item: { id: `extra${index}`, name, price: 0 }, index: 0 }] },
      });
      const { message } = await answer;
      if (message.type === "state") accepted = message.split;
      else if (message.type === "rejected" && message.rejection.reason !== "rateLimited") refusal = message.rejection;
      else await sleep(message.rejection?.retryAfterMs ?? 0);
    }
    const acceptedBytes = new TextEncoder().encode(JSON.stringify(accepted)).byteLength;
    note({ event: "refused", rejection: refusal, lastAcceptedRevision: accepted.revision, lastAcceptedBytes: acceptedBytes });
    const fresh = new Client("fresh-client", id);
    await fresh.open();
    const unchanged = JSON.stringify(fresh.split) === JSON.stringify(accepted);
    note({ event: "fresh client state", revision: fresh.split.revision, bytes: new TextEncoder().encode(JSON.stringify(fresh.split)).byteLength, unchanged });
    client.close();
    fresh.close();
    return { ok: refusal?.reason === "tooLarge" && unchanged, id, rejection: refusal, acceptedBytes, revision: fresh.split.revision };
  },

  async render() {
    if (!values.in || !values.shot) throw new Error(`render needs --in and --shot\n${USAGE}`);
    const { readFileSync } = await import("node:fs");
    const { chromium } = await import("@playwright/test");
    const text = readFileSync(values.in, "utf8");
    const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1100, height: 600 } });
    await page.setContent(`<pre style="font: 13px/1.4 ui-monospace, Menlo, monospace; margin: 16px; white-space: pre-wrap">${escaped}</pre>`);
    await page.screenshot({ path: values.shot, fullPage: true });
    await browser.close();
    return { ok: true, shot: values.shot };
  },
};

if (!commands[command]) {
  console.error(USAGE);
  finish({ ok: false, error: `unknown command ${command}` });
} else {
  commands[command]().then(finish, fail);
}
