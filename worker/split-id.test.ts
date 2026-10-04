import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { parseCreateSplitRequest } from "../src/core/parse";
import { isRoutableSplitId } from "../src/core/split";
import worker from "./index";
import { SplitServer } from "./split-server";
import { connect, createSplit, newSplit, probe, type Probed } from "./testing";

const notFound: Probed = { status: 101, first: { type: "unavailable", reason: "notFound" }, closed: { code: 4404, reason: "notFound" } };
const withoutSecret = { ...env, SPLIT_ID_SECRET: undefined } as Cloudflare.Env;
const fetchWithoutSecret = (request: Request) => worker.fetch(request as Parameters<typeof worker.fetch>[0], withoutSecret);

/** A Split stored before signed ids, under a 22-character random id that is already shared. */
async function legacySplit(id: string): Promise<string> {
  if (!isRoutableSplitId(id)) throw new Error(`${id} is not a legacy Split id`);
  const parsed = parseCreateSplitRequest({ split: newSplit }, id);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.rejection));
  const created = await env.SplitServer.getByName(id).create(parsed.split);
  if (!created.created) throw new Error(`${id} already held a Split`);
  return id;
}

function tampered(id: string): string {
  const last = id.at(-1) === "A" ? "B" : "A";
  return `${id.slice(0, -1)}${last}`;
}

const wakes: string[] = [];
const fetchSplit = SplitServer.prototype.fetch;
SplitServer.prototype.fetch = function (this: SplitServer, request: Request) {
  wakes.push(new URL(request.url).pathname);
  return fetchSplit.call(this, request);
};
afterEach(() => {
  wakes.length = 0;
});

describe("a new Split's id", () => {
  it("with one character changed ends as not found at the Worker, waking no Durable Object", async () => {
    const forged = tampered((await createSplit()).id);
    const seen = await probe(forged);
    const photo = await exports.default.fetch(`http://localhost/api/splits/${forged}/photo`);
    expect([seen, photo.status, wakes]).toEqual([notFound, 404, []]);
  });

  it("from a guess of the right shape ends as not found without waking a Durable Object, where a 22-character guess wakes one", async () => {
    expect([await probe("guessedSignedFormat00000"), wakes]).toEqual([notFound, []]);
    expect([await probe("guessedLegacyFormat000"), wakes]).toEqual([notFound, ["/parties/split-server/guessedLegacyFormat000"]]);
  });
});

describe("a Split stored under a 22-character id before signed ids", () => {
  it("keeps opening, taking edits and serving its photo route", async () => {
    const id = await legacySplit("legacySplitStored0000A");
    const client = await connect(id);
    expect(await client.next()).toMatchObject({ type: "state", split: { id } });
    client.send(JSON.stringify({ ref: "r1", op: { by: null, type: "claim", itemId: "fries", participantId: "ann" } }));
    expect(await client.next()).toMatchObject({ type: "state", ref: "r1", split: { revision: 1 } });
    expect((await exports.default.fetch(`http://localhost/api/splits/${id}/photo`)).status).toBe(404);
  });
});

describe("with no SPLIT_ID_SECRET set", () => {
  it("refuses a create with 503 unavailable", async () => {
    const request = new Request("http://localhost/api/splits", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.250" },
      body: JSON.stringify({ split: newSplit }),
    });
    const response = await fetchWithoutSecret(request);
    expect([response.status, await response.json()]).toEqual([503, { refused: "unavailable" }]);
  });

  it("keeps serving a Split under a 22-character id and ends a signed id as not found", async () => {
    const legacy = await legacySplit("legacySplitNoSecret00A");
    const { id: signed } = await createSplit();
    expect(await probeFirst(legacy)).toMatchObject({ type: "state", split: { id: legacy } });
    expect(await probe(signed, fetchWithoutSecret)).toEqual(notFound);
  });
});

async function probeFirst(id: string): Promise<unknown> {
  const response = await fetchWithoutSecret(new Request(`http://localhost/parties/split-server/${id}`, { headers: { upgrade: "websocket" } }));
  const socket = response.webSocket!;
  const first = new Promise<unknown>((resolve) => socket.addEventListener("message", ({ data }) => resolve(JSON.parse(String(data)))));
  socket.accept();
  const message = await first;
  socket.close();
  return message;
}

describe("a pick stored before per-Split device ids", () => {
  it("reaches clients as that browser's id for this Split, never the raw id", async () => {
    const id = await legacySplit("legacyRawPick00000000A");
    const stub = env.SplitServer.getByName(id);
    await runInDurableObject(stub, (_, state) => {
      const { json } = state.storage.sql.exec<{ json: string }>("SELECT json FROM split").one();
      state.storage.sql.exec("UPDATE split SET json = ?", JSON.stringify({ ...JSON.parse(json), picks: [{ participantId: "ann", device: "AbCdEfGh01234567" }] }));
    });
    await evictDurableObject(stub);
    const raw = await (await connect(id)).nextRaw();
    expect([JSON.parse(raw).split.picks, raw.includes("AbCdEfGh01234567")]).toEqual([[{ participantId: "ann", device: "lxKCYXOdxs171iM4ol84L2" }], false]);
  });
});
