import { routePartykitRequest } from "partyserver";
import { isMintedSplitId } from "../src/core/split";
import { createSplit } from "./create";

export { CreateLimiter } from "./rate-limit";
export { SplitServer } from "./split-server";

const SPLIT_SOCKET_PATH = /^\/parties\/split-server\/([^/]+)$/;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/splits") return createSplit(request, env);
    const id = SPLIT_SOCKET_PATH.exec(pathname)?.[1];
    const upgrade = request.headers.get("upgrade")?.toLowerCase() === "websocket";
    if (id !== undefined && upgrade && isMintedSplitId(id)) {
      const response = await routePartykitRequest(request, env);
      if (response) return response;
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
