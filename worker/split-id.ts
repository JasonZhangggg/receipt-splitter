import { base64Url, hmacSha256 } from "../src/core/hmac";
import { LEGACY_SPLIT_ID_LENGTH, SIGNED_SPLIT_ID_LENGTH, isRoutableSplitId, randomId, type MintedSplitId } from "../src/core/split";

const BODY_LENGTH = 16;
const TAG_LENGTH = SIGNED_SPLIT_ID_LENGTH - BODY_LENGTH;
/** `openssl rand -base64 32` prints 44 characters. A shorter secret counts as unset. */
const MIN_SECRET_LENGTH = 32;

export type SplitIdSecret = { readonly key: Uint8Array };

/** The Worker secret that signs Split ids, or null when it is unset or too short to trust. */
export function splitIdSecret(env: Cloudflare.Env): SplitIdSecret | null {
  const secret = env.SPLIT_ID_SECRET;
  if (secret === undefined || secret.length < MIN_SECRET_LENGTH) return null;
  return { key: new TextEncoder().encode(secret) };
}

function tag(secret: SplitIdSecret, body: string): string {
  return base64Url(hmacSha256(secret.key, new TextEncoder().encode(body))).slice(0, TAG_LENGTH);
}

export function mintSplitId(secret: SplitIdSecret): MintedSplitId {
  const body = randomId(BODY_LENGTH);
  const id = `${body}${tag(secret, body)}`;
  if (!isRoutableSplitId(id)) throw new Error(`minted ${id}, which is not a Split id`);
  return id;
}

/**
 * Whether a request for `id` may reach its Durable Object.
 * A signed id must carry its tag. A 22-character id predates signing and has no tag, so it routes, and its Durable Object answers a missing Split without writing (ADR 0009).
 */
export function routesToSplit(id: string, secret: SplitIdSecret | null): id is MintedSplitId {
  if (!isRoutableSplitId(id)) return false;
  if (id.length === LEGACY_SPLIT_ID_LENGTH) return true;
  if (secret === null) return false;
  const encoder = new TextEncoder();
  const presented = encoder.encode(id.slice(BODY_LENGTH));
  const expected = encoder.encode(tag(secret, id.slice(0, BODY_LENGTH)));
  return presented.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(presented, expected);
}
