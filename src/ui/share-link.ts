/** Opens the share sheet for a link, or copies it where there is none. Resolves "shared", "copied" or "failed" so the caller can say what happened. */
export async function shareLink(url: string): Promise<"shared" | "copied" | "failed"> {
  // A cancelled share sheet rejects, and that is not a failure. Only the copy fallback has a result to show.
  if (typeof navigator.share === "function") return navigator.share({ url }).then(() => "shared" as const, () => "shared" as const);
  const copied = await (navigator.clipboard?.writeText(url).then(() => true) ?? Promise.resolve(false)).catch(() => false);
  return copied ? "copied" : "failed";
}

/** The site's own address, for Share on pages that aren't a Split. */
export const siteUrl = () => `${location.origin}/`;
