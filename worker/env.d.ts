declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./index");
    durableNamespaces: "SplitServer" | "CreateLimiter";
  }

  interface Env {
    SplitServer: DurableObjectNamespace<import("./split-server").SplitServer>;
    CreateLimiter: DurableObjectNamespace<import("./rate-limit").CreateLimiter>;
    TURNSTILE_SECRET_KEY: string;
  }
}
