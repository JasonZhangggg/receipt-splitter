import { describe, expect, test } from "vitest";
import { runTotalCheck } from "../core/total-check";
import { parseReceipt } from ".";
import receipt1019 from "./fixtures/srd-1019.json";
import receipt1040 from "./fixtures/srd-1040.json";

type Fixture = { boxes: Parameters<typeof parseReceipt>[0] };

const boxesOf = (fixture: unknown) => (fixture as Fixture).boxes;

describe("parseReceipt", () => {
  test("reads SRD receipt 1040 into its Items, tax, service charge, and total", () => {
    const receipt = parseReceipt(boxesOf(receipt1040));

    expect(receipt).toEqual({
      items: [
        { id: "i1", name: "Chicken Fried Rice And Egg", price: 799 },
        { id: "i2", name: "California Tropic And Miso", price: 799 },
        { id: "i3", name: "Add Two Tostones", price: 100 },
        { id: "i4", name: "Sprite", price: 250 },
        { id: "i5", name: "Perrier Sparkling Water", price: 350 },
      ],
      adjustments: [
        { id: "a1", kind: "tax", name: "Tax", amount: 161 },
        { id: "a2", kind: "serviceCharge", name: "Service fees on tables", amount: 345 },
      ],
      subtotal: 2298,
      total: 2804,
    });
    expect(runTotalCheck(receipt!)).toEqual({ ok: true });
  });

  test("keeps each price of the curled SRD receipt 1019 on its own Item", () => {
    const receipt = parseReceipt(boxesOf(receipt1019));

    expect(receipt?.items.map(({ name, price }) => [name, price])).toEqual([
      ["Ultra", 250],
      ["Bells Draft", 500],
      ["Cheese Bread", 600],
      ["APPS OUT FIRST", 0],
      ["Caprese", 700],
      ["SALAD OUT FIRST", 0],
      ["Reg Carnivore (s)", 1250],
      ["Reg Margherita (s)", 1000],
    ]);
    expect(receipt?.adjustments).toEqual([{ id: "a1", kind: "tax", name: "Tax 1", amount: 258 }]);
    expect([receipt?.subtotal, receipt?.total]).toEqual([4300, 4558]);
    expect(runTotalCheck(receipt!)).toEqual({ ok: true });
  });

  test("returns null when the boxes hold no priced Item", () => {
    expect(parseReceipt([])).toBeNull();
  });
});
