#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";

const { values } = parseArgs({ options: { port: { type: "string" }, id: { type: "string" }, row: { type: "string" } } });

function done(line) {
  process.stdout.write(`${JSON.stringify(line)}\n`);
  process.exit(line.ok ? 0 : 1);
}

if (!values.port || !values.id || !values.row) done({ ok: false, error: "usage: seed.mjs --port <port> --id <split id> --row <golden json>" });

const folder = join(".verify", values.port, "state", "v3", "do", "app-SplitServer");
const files = (() => {
  try {
    return readdirSync(folder).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  } catch {
    return done({ ok: false, error: `no Split storage in ${folder}; launch on --port ${values.port} and create the Split first` });
  }
})();

const row = { ...JSON.parse(readFileSync(values.row, "utf8")), id: values.id };
for (const file of files) {
  const db = new DatabaseSync(join(folder, file));
  const holds = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'split'").get() && db.prepare("SELECT json FROM split").get()?.json.includes(`"id":"${values.id}"`);
  if (holds) {
    db.prepare("UPDATE split SET json = ?").run(JSON.stringify(row));
    db.close();
    done({ ok: true, id: values.id, file: join(folder, file), schemaVersion: row.schemaVersion });
  }
  db.close();
}
done({ ok: false, error: `no stored Split ${values.id} under ${folder}` });
