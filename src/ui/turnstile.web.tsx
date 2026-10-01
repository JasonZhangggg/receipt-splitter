import type * as Native from "./turnstile";

type Widget = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
};

const siteKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000BB";
const scriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const giveUpAfter = 20_000;

let loading: Promise<Widget> | null = null;

function load(): Promise<Widget> {
  loading ??= new Promise<Widget>((resolve, reject) => {
    const script = Object.assign(document.createElement("script"), { src: scriptUrl, async: true });
    script.onload = () => {
      const widget = (globalThis as { turnstile?: Widget }).turnstile;
      if (widget) resolve(widget);
      else reject(new Error("Turnstile did not load"));
    };
    script.onerror = () => reject(new Error("Turnstile did not load"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

export const prepareTurnstile: typeof Native.prepareTurnstile = () => {
  load().catch(() => {});
};

export const turnstileToken: typeof Native.turnstileToken = async () => {
  const widget = await load();
  const box = Object.assign(document.createElement("div"), { className: "rs-turnstile" });
  document.body.appendChild(box);
  let id: string | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      setTimeout(() => reject(new Error("Turnstile timed out")), giveUpAfter);
      id = widget.render(box, {
        sitekey: siteKey,
        appearance: "interaction-only",
        retry: "never",
        callback: resolve,
        "error-callback": (code: string) => reject(new Error(`Turnstile failed with ${code}`)),
        "expired-callback": () => reject(new Error("Turnstile expired")),
      });
    });
  } finally {
    if (id !== undefined) widget.remove(id);
    box.remove();
  }
};
