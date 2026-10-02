const key = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const testKey = key === "" || /^[123]x/.test(key);

if (testKey && process.env.ALLOW_TEST_TURNSTILE !== "1") {
  const found = key === "" ? "is not set" : `is the Cloudflare test key ${key}, which passes every visitor`;
  console.error(
    `EXPO_PUBLIC_TURNSTILE_SITE_KEY ${found}. Export the production site key before npm run build, or set ALLOW_TEST_TURNSTILE=1 for a local or CI build.`,
  );
  process.exit(1);
}
