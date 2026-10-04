import { evictDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { probe, rowsWrittenBy, type Probed } from "./testing";

const notFound: Probed = { status: 101, first: { type: "unavailable", reason: "notFound" }, closed: { code: 4404, reason: "notFound" } };

describe("a probe to a 22-character id no Split holds", () => {
  it("ends the socket as not found and writes 0 Durable Object rows", async () => {
    const id = "probeRandomId00000000A";
    let seen: Probed | undefined;
    const rows = await rowsWrittenBy(id, async () => {
      seen = await probe(id);
    });
    expect([seen, rows]).toEqual([notFound, 0]);
  });

  it("writes 0 rows again once the object is evicted and probed cold", async () => {
    const id = "probeRandomId00000000C";
    await probe(id);
    await evictDurableObject(env.SplitServer.getByName(id));
    expect(await rowsWrittenBy(id, () => probe(id))).toBe(0);
  });

  it("answers a photo GET with 404 and writes 0 rows", async () => {
    const id = "probeRandomId00000000B";
    let status = 0;
    const rows = await rowsWrittenBy(id, async () => {
      status = (await exports.default.fetch(`http://localhost/api/splits/${id}/photo`)).status;
    });
    expect([status, rows]).toEqual([404, 0]);
  });
});
