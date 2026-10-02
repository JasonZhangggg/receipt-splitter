/** Opens `href`, then `fallback` if that fails. Never rejects, so a press handler can drop the promise. */
export async function openWithFallback(open: (url: string) => Promise<unknown>, href: string, fallback?: string): Promise<boolean> {
  for (const url of fallback === undefined ? [href] : [href, fallback]) {
    if (await Promise.resolve(url).then(open).then(() => true, () => false)) return true;
  }
  return false;
}
