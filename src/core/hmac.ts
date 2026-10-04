/**
 * HMAC-SHA256 (RFC 2104, FIPS 180-4), synchronous so that parsing and applying operations stay synchronous on the client and in the Durable Object.
 * Web Crypto's subtle API is async only.
 */
const K = Uint32Array.from(
  "428a2f98 71374491 b5c0fbcf e9b5dba5 3956c25b 59f111f1 923f82a4 ab1c5ed5 d807aa98 12835b01 243185be 550c7dc3 72be5d74 80deb1fe 9bdc06a7 c19bf174 e49b69c1 efbe4786 0fc19dc6 240ca1cc 2de92c6f 4a7484aa 5cb0a9dc 76f988da 983e5152 a831c66d b00327c8 bf597fc7 c6e00bf3 d5a79147 06ca6351 14292967 27b70a85 2e1b2138 4d2c6dfc 53380d13 650a7354 766a0abb 81c2c92e 92722c85 a2bfe8a1 a81a664b c24b8b70 c76c51a3 d192e819 d6990624 f40e3585 106aa070 19a4c116 1e376c08 2748774c 34b0bcb5 391c0cb3 4ed8aa4a 5b9cca4f 682e6ff3 748f82ee 78a5636f 84c87814 8cc70208 90befffa a4506ceb bef9a3f7 c67178f2"
    .split(" ")
    .map((word) => parseInt(word, 16)),
);
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const BLOCK = 64;

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(message: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil((message.length + 9) / BLOCK) * BLOCK);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(message.length / 0x20000000));
  view.setUint32(padded.length - 4, message.length * 8);
  const h = [...H0];
  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += BLOCK) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(block + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = w[t - 16] + s0 + w[t - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0];
    }
    [a, b, c, d, e, f, g, hh].forEach((value, index) => (h[index] = (h[index] + value) | 0));
  }
  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  h.forEach((value, index) => out.setUint32(index * 4, value));
  return digest;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(BLOCK);
  block.set(key.length > BLOCK ? sha256(key) : key);
  const pad = (byte: number, tail: Uint8Array) => {
    const joined = new Uint8Array(BLOCK + tail.length);
    joined.set(block.map((value) => value ^ byte));
    joined.set(tail, BLOCK);
    return joined;
  };
  return sha256(pad(0x5c, sha256(pad(0x36, message))));
}

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
