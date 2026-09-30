import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseNewSplit } from "../src/core/parse";
import { isMintedSplitId } from "../src/core/split";
import { runTotalCheck } from "../src/core/total-check";
import { readLabels } from "./read-labels.mjs";

const BENCH = import.meta.dirname;
const labels = readLabels(join(BENCH, "labels"));
const SPLIT_ID = "benchlabelreceipt";

function asReceipt(receipt: unknown) {
  if (!isMintedSplitId(SPLIT_ID)) throw new RangeError(`${SPLIT_ID} is too short for a minted Split id`);
  const parsed = parseNewSplit({ receipt, host: { id: "host", name: "Host" }, paymentHandles: [{ service: "venmo", handle: "bench" }] }, SPLIT_ID);
  return parsed.ok ? parsed.split.receipt : parsed.rejection;
}

describe("bench labels", () => {
  test("pair one label with each committed image", () => {
    const images = readdirSync(join(BENCH, "data")).filter((file) => file.endsWith(".jpg"));

    expect(labels.map(({ image }) => image).sort()).toEqual(images.sort());
    expect(labels.filter(({ name, image }) => image !== `${name}.jpg`).map(({ name }) => name)).toEqual([]);
  });

  test.each(labels.map((label) => [label.name, label] as const))("%s parses as a Receipt", (_, label) => {
    expect(asReceipt(label.receipt)).toEqual({
      ...label.receipt,
      items: label.receipt.items.map((item: object) => ({ ...item, claimedBy: [] })),
    });
  });

  test.each(labels.filter(({ region }) => region === "US").map((label) => [label.name, label] as const))(
    "%s passes the Total check against its printed total",
    (_, label) => {
      expect(runTotalCheck(label.receipt)).toEqual({ ok: true });
    },
  );
});
