declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./index");
    durableNamespaces: "SplitServer" | "CreateLimiter";
  }

  interface Env {
    SplitServer: DurableObjectNamespace<import("./split-server").SplitServer>;
    CreateLimiter: DurableObjectNamespace<import("./rate-limit").CreateLimiter>;
    OPENROUTER_API_KEY?: string;
    SPLIT_ID_SECRET?: string;
    SCAN_PER_MINUTE: string;
    SCAN_PER_DAY: string;
    SCAN_DAILY_CAP: string;
    SCAN_DAILY_BUDGET_USD: string;
    SCAN_WORST_CASE_USD: string;
    SCAN_MAX_IMAGE_PX: string;
    SCAN_PASS1_MODEL: string;
    SCAN_PASS1_HOSTS: string;
    SCAN_PASS1_EFFORT: string;
    SCAN_PASS1_TIMEOUT_MS: string;
    SCAN_PASS1_MAX_TOKENS: string;
    SCAN_PASS2_MODEL: string;
    SCAN_PASS2_HOSTS: string;
    SCAN_PASS2_EFFORT: string;
    SCAN_PASS2_TIMEOUT_MS: string;
    SCAN_PASS2_MAX_TOKENS: string;
    SCAN_DEBUG_HEADERS: string;
  }
}
