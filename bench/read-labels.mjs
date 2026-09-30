import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function readLabels(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({ name: file.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(dir, file), "utf8")) }));
}
