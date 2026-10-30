import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createSplit, leftovers } from "./testing";

describe("routing", () => {
  it("serves the Search Console ownership file itself, not a redirect", async () => {
    const response = await exports.default.fetch("http://localhost/googlea240a19fcff04246.html");
    expect([response.status, await response.text()]).toEqual([200, "google-site-verification: googlea240a19fcff04246.html"]);
  });

  it("answers an unknown API path with 404", async () => {
    const response = await exports.default.fetch("http://localhost/api/unknown");
    expect(response.status).toBe(404);
  });

  it("tells browsers not to sniff an API response into another type", async () => {
    const responses = await Promise.all(["http://localhost/api/unknown", "http://localhost/api/splits"].map((url) => exports.default.fetch(url)));
    expect(responses.map((response) => [response.status, response.headers.get("x-content-type-options")])).toEqual([
      [404, "nosniff"],
      [405, "nosniff"],
    ]);
  });

  it("serves the Split socket only for a minted id on the split-server party", async () => {
    const upgrade = { headers: { upgrade: "websocket" } };
    const statuses = await Promise.all(
      [
        "http://localhost/parties/split-server/short",
        "http://localhost/parties/split-server/sixteen-chars-00",
        "http://localhost/parties/split-server/has.a.dot.in.it.000000",
        "http://localhost/parties/create-limiter/203.0.113.5",
        "http://localhost/parties/split-server/abcdefghijklmnopqrstuv/extra",
      ].map(async (url) => (await exports.default.fetch(url, upgrade)).status),
    );
    expect(statuses).toEqual([404, 404, 404, 404, 404]);
    const plain = await exports.default.fetch("http://localhost/parties/split-server/abcdefghijklmnopqrstuv");
    expect(plain.status).toBe(404);
    const socket = await exports.default.fetch("http://localhost/parties/split-server/abcdefghijklmnopqrstuv", upgrade);
    expect(socket.status).toBe(101);
  });

  it("answers a plain GET on a minted-format id without waking the Split's storage", async () => {
    const id = "getWithoutUpgrade0000A";
    const response = await exports.default.fetch(`http://localhost/parties/split-server/${id}`);
    expect(response.status).toBe(404);
    expect(await leftovers(id)).toEqual({ tables: [], keys: [], alarm: null });
  });

  it("drops client-supplied partyserver inputs before the Split socket", async () => {
    const { id } = await createSplit();
    const response = await exports.default.fetch(`http://localhost/parties/split-server/${id}?_pk=${"k".repeat(300)}`, {
      headers: { upgrade: "websocket", "x-partykit-props": "not base64 json" },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    const first = new Promise<string>((resolve) => socket.addEventListener("message", ({ data }) => resolve(String(data))));
    socket.accept();
    expect(JSON.parse(await first)).toMatchObject({ type: "state", ref: null, split: { id } });
  });
});
