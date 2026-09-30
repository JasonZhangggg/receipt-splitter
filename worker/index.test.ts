import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("routing", () => {
  it("answers an unknown API path with 404", async () => {
    const response = await exports.default.fetch("http://localhost/api/unknown");
    expect(response.status).toBe(404);
  });

  it("serves the Split socket only for a minted id on the split-server party", async () => {
    const upgrade = { headers: { upgrade: "websocket" } };
    const statuses = await Promise.all(
      [
        "http://localhost/parties/split-server/short",
        "http://localhost/parties/split-server/has.a.dot.in.it.000000",
        "http://localhost/parties/create-limiter/203.0.113.5",
        "http://localhost/parties/split-server/abcdefghijklmnop/extra",
      ].map(async (url) => (await exports.default.fetch(url, upgrade)).status),
    );
    expect(statuses).toEqual([404, 404, 404, 404]);
    const plain = await exports.default.fetch("http://localhost/parties/split-server/abcdefghijklmnop");
    expect(plain.status).toBe(404);
    const socket = await exports.default.fetch("http://localhost/parties/split-server/abcdefghijklmnop", upgrade);
    expect(socket.status).toBe(101);
  });
});
