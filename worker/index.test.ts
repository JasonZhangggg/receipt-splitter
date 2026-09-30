import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("answers an unknown API path with 404", async () => {
  const response = await exports.default.fetch("http://localhost/api/unknown");
  expect(response.status).toBe(404);
});
