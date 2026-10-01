import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");

const diner = {
  image: "srd-diner.jpg",
  source: "srd",
  sourceId: "diner",
  region: "US",
  tags: ["tipBlock"],
  checked: false,
  receipt: {
    items: [
      { id: "i1", name: "Burger", price: 1450 },
      { id: "i2", name: "Fries", price: 600 },
      { id: "i3", name: "Soda", price: 299 },
    ],
    adjustments: [
      { id: "a1", kind: "tax", name: "Tax", amount: 208 },
      { id: "a2", kind: "tip", name: "Tip", amount: 400 },
    ],
    subtotal: 2349,
    total: 2957,
  },
};

const warung = {
  image: "cord-warung.jpg",
  source: "cord",
  sourceId: "warung",
  region: "ID",
  tags: ["serviceCharge"],
  checked: false,
  receipt: {
    items: [
      { id: "i1", name: "Nasi Goreng", price: 25000 },
      { id: "i2", name: "Es Teh", price: 5000 },
    ],
    adjustments: [{ id: "a1", kind: "serviceCharge", name: "Service", amount: 1500 }],
    subtotal: 30000,
    total: 31500,
  },
};

function benchDir(labels: readonly (typeof diner | typeof warung)[]): string {
  const dir = mkdtempSync(join(tmpdir(), "bench-score-"));
  mkdirSync(join(dir, "labels"));
  for (const label of labels) writeFileSync(join(dir, "labels", label.image.replace(".jpg", ".json")), JSON.stringify(label));
  return dir;
}

function parserModule(dir: string, receipts: Record<string, unknown>): string {
  const path = join(dir, "parser.mjs");
  writeFileSync(path, `const receipts = ${JSON.stringify(receipts)};\nexport default ({ name }) => receipts[name] ?? null;\n`);
  return path;
}

function score(dir: string, parser: string): unknown {
  const output = execFileSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "bench/score.mjs", `--parser=${parser}`, `--labels=${join(dir, "labels")}`, "--json"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return JSON.parse(output);
}

describe("bench/score.mjs", () => {
  test("scores the labels against themselves at 100 percent", () => {
    const dir = benchDir([diner, warung]);

    expect(score(dir, "labels")).toEqual({
      exact: { receipts: 1, items: [3, 3], adjustments: [2, 2], totalCheck: [1, 1] },
      structure: { receipts: 1, items: [2, 2], adjustments: [1, 1] },
      misses: [],
    });
  });

  test("lowers the Item score by exactly one Item when one Item price is wrong", () => {
    const dir = benchDir([diner, warung]);
    const [burger, fries, soda] = diner.receipt.items;
    const misreadFries = { ...diner.receipt, items: [burger, { ...fries, price: 60 }, soda] };
    const parser = parserModule(dir, { "srd-diner": misreadFries, "cord-warung": warung.receipt });

    expect(score(dir, parser)).toEqual({
      exact: { receipts: 1, items: [2, 3], adjustments: [2, 2], totalCheck: [0, 1] },
      structure: { receipts: 1, items: [2, 2], adjustments: [1, 1] },
      misses: ["srd-diner"],
    });
  });

  test("scores a CORD Receipt on its structure, not its prices", () => {
    const dir = benchDir([warung]);
    const [nasi, teh] = warung.receipt.items;
    const reread = {
      items: [{ ...nasi, price: 2500 }, { ...teh, price: 500 }],
      adjustments: [{ ...warung.receipt.adjustments[0], amount: 150 }],
      subtotal: 3000,
      total: 3150,
    };

    expect(score(dir, parserModule(dir, { "cord-warung": reread }))).toEqual({
      exact: { receipts: 0, items: [0, 0], adjustments: [0, 0], totalCheck: [0, 0] },
      structure: { receipts: 1, items: [2, 2], adjustments: [1, 1] },
      misses: [],
    });
  });

  test("counts a Receipt the parser cannot read as a miss with no matches", () => {
    const dir = benchDir([diner]);

    expect(score(dir, parserModule(dir, {}))).toEqual({
      exact: { receipts: 1, items: [0, 3], adjustments: [0, 2], totalCheck: [0, 1] },
      structure: { receipts: 0, items: [0, 0], adjustments: [0, 0] },
      misses: ["srd-diner"],
    });
  });

  test.each([
    ["no adjustments array", { items: [] }],
    ["a null Item", { items: [null], adjustments: [], subtotal: 0, total: 0 }],
    ["a text price", { items: [{ id: "i1", name: "Burger", price: "14.50" }], adjustments: [], subtotal: 1450, total: 1450 }],
    ["no subtotal", { ...diner.receipt, subtotal: undefined }],
    ["no total", { ...diner.receipt, total: undefined }],
    ["an Adjustment with no kind", { ...diner.receipt, adjustments: diner.receipt.adjustments.map(({ amount }) => ({ amount })) }],
  ])("counts a parser result with %s as a miss and keeps scoring the rest", (_, malformed) => {
    const dir = benchDir([diner, warung]);
    const parser = parserModule(dir, { "srd-diner": malformed, "cord-warung": warung.receipt });

    expect(score(dir, parser)).toEqual({
      exact: { receipts: 1, items: [0, 3], adjustments: [0, 2], totalCheck: [0, 1] },
      structure: { receipts: 1, items: [2, 2], adjustments: [1, 1] },
      misses: ["srd-diner"],
    });
  });

  test("counts a parser that throws as a miss and keeps scoring the rest", () => {
    const dir = benchDir([diner, warung]);
    const parser = join(dir, "throws.mjs");
    writeFileSync(parser, `export default ({ name }) => { if (name === "srd-diner") throw new Error("unreadable"); return ${JSON.stringify(warung.receipt)}; };\n`);

    expect(score(dir, parser)).toEqual({
      exact: { receipts: 1, items: [0, 3], adjustments: [0, 2], totalCheck: [0, 1] },
      structure: { receipts: 1, items: [2, 2], adjustments: [1, 1] },
      misses: ["srd-diner"],
    });
  });

  test("fails the Total check when a consistent Receipt has a total other than the label's", () => {
    const dir = benchDir([diner]);
    const withoutTip = { ...diner.receipt, adjustments: [diner.receipt.adjustments[0]], total: 2557 };

    expect(score(dir, parserModule(dir, { "srd-diner": withoutTip }))).toEqual({
      exact: { receipts: 1, items: [3, 3], adjustments: [1, 2], totalCheck: [0, 1] },
      structure: { receipts: 0, items: [0, 0], adjustments: [0, 0] },
      misses: ["srd-diner"],
    });
  });

  test("misses an Item price that is one cent off", () => {
    const dir = benchDir([diner]);
    const [burger, fries, soda] = diner.receipt.items;
    const oneCentOff = { ...diner.receipt, items: [{ ...burger, price: 1451 }, fries, soda], subtotal: 2350, total: 2958 };

    expect(score(dir, parserModule(dir, { "srd-diner": oneCentOff }))).toEqual({
      exact: { receipts: 1, items: [2, 3], adjustments: [2, 2], totalCheck: [0, 1] },
      structure: { receipts: 0, items: [0, 0], adjustments: [0, 0] },
      misses: ["srd-diner"],
    });
  });

  test("lists a receipt whose rows all match but whose Total check fails as a miss", () => {
    const dir = benchDir([diner]);

    expect(score(dir, parserModule(dir, { "srd-diner": { ...diner.receipt, total: 2958 } }))).toEqual({
      exact: { receipts: 1, items: [3, 3], adjustments: [2, 2], totalCheck: [0, 1] },
      structure: { receipts: 0, items: [0, 0], adjustments: [0, 0] },
      misses: ["srd-diner"],
    });
  });

  test("times a parser's parse and leaves out the time its load takes", () => {
    const dir = benchDir([diner, warung]);
    const parser = join(dir, "loads.mjs");
    writeFileSync(
      parser,
      `const receipts = ${JSON.stringify({ "srd-diner": diner.receipt, "cord-warung": warung.receipt })};
export function load({ name }) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  return receipts[name];
}
export default (receipt) => receipt;
`,
    );
    const output = execFileSync(
      process.execPath,
      ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "bench/score.mjs", `--parser=${parser}`, `--labels=${join(dir, "labels")}`],
      { cwd: ROOT, encoding: "utf8" },
    );

    expect(output).toMatch(/^exact, 1 receipts: Item prices 3\/3 100\.0%, Adjustments 2\/2 100\.0%, Total check 1\/1 100\.0%$/m);
    expect(Number(output.match(/^parse: median (\d+(?:\.\d+)?) ms over 2 receipts$/m)?.[1])).toBeLessThan(100);
  });

  test("scores every committed label against itself at 100 percent", () => {
    const output = execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "bench/score.mjs", "--parser=labels"], {
      cwd: ROOT,
      encoding: "utf8",
    });

    expect(output).toMatch(/^exact, (\d+) receipts: Item prices (\d+)\/\2 100\.0%, Adjustments (\d+)\/\3 100\.0%, Total check \1\/\1 100\.0%$/m);
    expect(output).toMatch(/^structure, (\d+) receipts: Items (\d+)\/\2 100\.0%, Adjustments (\d+)\/\3 100\.0%$/m);
    expect(output).toMatch(/^misses: none$/m);
  });

  test("runs a parser in bench/parsers by its bare name and prints its median parse time", () => {
    const output = execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "bench/score.mjs", "--parser=app"], {
      cwd: ROOT,
      encoding: "utf8",
    });

    expect(output).toMatch(/^exact, 62 receipts: Item prices \d+\/268 \d+\.\d%, Adjustments \d+\/79 \d+\.\d%, Total check \d+\/62 \d+\.\d%$/m);
    expect(output).toMatch(/^structure, 20 receipts: Items \d+\/67 \d+\.\d%, Adjustments \d+\/26 \d+\.\d%\nparse: median \d+(\.\d+)? ms over 82 receipts$/m);
  });
});
