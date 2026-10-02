import { routePartykitRequest } from "partyserver";
import { isRoutableSplitId } from "../src/core/split";
import { createSplit } from "./create";
import { servePhoto } from "./photo";

export { CreateLimiter } from "./rate-limit";
export { SplitServer } from "./split-server";

const SPLIT_SOCKET_PATH = /^\/parties\/split-server\/([^/]+)$/;
const PHOTO_PATH = /^\/api\/splits\/([^/]+)\/photo$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/splits") {
      const response = await createSplit(request, env);
      response.headers.set("x-content-type-options", "nosniff");
      return response;
    }
    const photoSplitId = PHOTO_PATH.exec(url.pathname)?.[1];
    if (photoSplitId !== undefined) {
      const response = await servePhoto(request, env, photoSplitId);
      response.headers.set("x-content-type-options", "nosniff");
      return response;
    }
    const id = SPLIT_SOCKET_PATH.exec(url.pathname)?.[1];
    const upgrade = request.headers.get("upgrade")?.toLowerCase() === "websocket";
    if (id !== undefined && upgrade && isRoutableSplitId(id)) {
      const response = await routePartykitRequest(withoutPartyInputs(request, url), env);
      if (response) return response;
    }
    return new Response("Not found", { status: 404, headers: { "x-content-type-options": "nosniff" } });
  },
} satisfies ExportedHandler<Cloudflare.Env>;

function withoutPartyInputs(request: Request, url: URL): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("x-partykit-")) headers.delete(name);
  return new Request(`${url.origin}${url.pathname}`, { method: request.method, headers });
}
