import { describe, expect, test } from "vitest";
import { MAX_CENTS, cents, price } from "./money";
import { computeShares, type Shares } from "./shares";
import { adjustmentId, itemId, participantId, type AdjustmentKind, type Split, type SplitItem } from "./split";

type Row = readonly [id: string, price: number, claimers: readonly string[]];

function splitWith(options: {
  items: readonly [Row, ...Row[]];
  adjustments?: readonly (readonly [kind: AdjustmentKind, amount: number])[];
  participants?: readonly [string, ...string[]];
  payments?: readonly (readonly [who: string, amount: number])[];
}): Pick<Split, "receipt" | "participants" | "payments"> {
  const toItem = ([id, amount, claimers]: Row): SplitItem => ({
    id: itemId(id),
    name: id,
    price: price(amount),
    claimedBy: [...claimers].sort().map(participantId),
  });
  const [first, ...rest] = options.items;
  const adjustments = (options.adjustments ?? []).map(([kind, amount]) => ({
    id: adjustmentId(kind),
    kind,
    name: kind,
    amount: cents(amount),
  }));
  const subtotal = options.items.reduce((sum, [, amount]) => sum + amount, 0);
  const total = adjustments.reduce((sum, { amount }) => sum + amount, subtotal);
  const toParticipant = (id: string) => ({ id: participantId(id), name: id });
  const [host, ...others] = options.participants ?? ["ann", "bob", "cat"];
  return {
    receipt: { items: [toItem(first), ...rest.map(toItem)], adjustments, subtotal: cents(subtotal), total: cents(total) },
    participants: [toParticipant(host), ...others.map(toParticipant)],
    payments: (options.payments ?? []).map(([who, amount]) => ({ participantId: participantId(who), amount: cents(amount) })),
  };
}

function shareCents({ shares }: Shares): [string, number][] {
  return shares.map(({ participantId, share }) => [participantId, share]);
}

describe("computeShares", () => {
  test("a $30.00 pitcher Claimed by three Participants costs each 1000 cents", () => {
    const shares = computeShares(splitWith({ items: [["pitcher", 3000, ["ann", "bob", "cat"]]] }));

    expect(shareCents(shares)).toEqual([
      ["ann", 1000],
      ["bob", 1000],
      ["cat", 1000],
    ]);
  });

  test("a $10.00 Item split three ways gives 334, 333, and 333 cents", () => {
    const { shares } = computeShares(splitWith({ items: [["nachos", 1000, ["cat", "ann", "bob"]]] }));

    expect(shares.map(({ share }) => share).sort((a, b) => a - b)).toEqual([333, 333, 334]);
    expect(shares.reduce((sum, { share }) => sum + share, 0)).toBe(1000);
  });

  test("tax and tip divide in proportion to each Participant's Claimed Items", () => {
    const shares = computeShares(
      splitWith({
        items: [
          ["burger", 2000, ["ann"]],
          ["salad", 1000, ["bob"]],
        ],
        adjustments: [
          ["tax", 266],
          ["tip", 600],
        ],
      }),
    );

    expect(shareCents(shares)).toEqual([
      ["ann", 2577],
      ["bob", 1289],
      ["cat", 0],
    ]);
  });

  test("an Item-level discount lowers only its claimer's Share and their part of the tax", () => {
    const burgerLessHappyHour = 2000 - 500;
    const shares = computeShares(
      splitWith({
        items: [
          ["burger", burgerLessHappyHour, ["ann"]],
          ["salad", 1500, ["bob"]],
        ],
        adjustments: [["tax", 266]],
      }),
    );

    expect(shareCents(shares)).toEqual([
      ["ann", 1633],
      ["bob", 1633],
      ["cat", 0],
    ]);
  });

  test("an Unclaimed item keeps its price and its part of the Adjustments out of every Share", () => {
    const shares = computeShares(
      splitWith({
        items: [
          ["burger", 2000, ["ann"]],
          ["salad", 1000, []],
        ],
        adjustments: [
          ["tax", 266],
          ["tip", 600],
        ],
      }),
    );

    expect(shareCents(shares)).toEqual([
      ["ann", 2577],
      ["bob", 0],
      ["cat", 0],
    ]);
    expect(shares.unclaimed).toEqual({ itemIds: ["salad"], subtotal: 1000, total: 1289 });
  });

  test("Shares sum exactly to the Receipt total", () => {
    const shares = computeShares(
      splitWith({
        items: [
          ["burger", 1850, ["ann"]],
          ["fries", 600, ["ann", "bob"]],
          ["pitcher", 3000, ["ann", "bob", "cat"]],
          ["salad", 1275, ["cat"]],
        ],
        adjustments: [
          ["tax", 597],
          ["tip", 1345],
        ],
      }),
    );

    expect(shareCents(shares)).toEqual([
      ["ann", 4059],
      ["bob", 1676],
      ["cat", 2932],
    ]);
    expect(shares.shares.reduce((sum, { share }) => sum + share, 0)).toBe(8667);
    expect(shares.unclaimed).toEqual({ itemIds: [], subtotal: 0, total: 0 });
  });

  test("reports what each Participant paid and still owes, negative when they overpaid, and nothing owed for the Host", () => {
    const { shares } = computeShares(
      splitWith({
        items: [["pitcher", 3000, ["ann", "bob", "cat"]]],
        payments: [
          ["bob", 1200],
          ["cat", 500],
        ],
      }),
    );

    expect(shares).toEqual([
      { participantId: "ann", share: 1000 },
      { participantId: "bob", share: 1000, paid: 1200, owed: -200 },
      { participantId: "cat", share: 1000, paid: 500, owed: 500 },
    ]);
  });

  test("a charge on a Receipt of $0.00 Items divides evenly across the Items", () => {
    const shares = computeShares(
      splitWith({
        items: [
          ["bread", 0, ["ann"]],
          ["water", 0, ["bob"]],
        ],
        adjustments: [["serviceCharge", 300]],
      }),
    );

    expect(shareCents(shares)).toEqual([
      ["ann", 150],
      ["bob", 150],
      ["cat", 0],
    ]);
  });

  test("Items Claimed by the same Participants are split as one pool, so three shared $10.00 Items cost each exactly $10.00", () => {
    const everyone = ["ann", "bob", "cat"];
    const shares = computeShares(
      splitWith({
        items: [
          ["1", 1000, everyone],
          ["2", 1000, everyone],
          ["3", 1000, everyone],
        ],
      }),
    );

    expect(shareCents(shares)).toEqual([
      ["ann", 1000],
      ["bob", 1000],
      ["cat", 1000],
    ]);
  });

  test("Participants who share every Item land within 1 cent of an exact twelfth, across 200 seeded receipts", () => {
    const people = Array.from({ length: 12 }, (_, index) => `p${String(index).padStart(2, "0")}`);
    const [host, ...others] = people;
    let state = 7;
    const nextPrice = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return 100 + (state % 4900);
    };
    let worst = 0;
    for (let receipt = 0; receipt < 200; receipt++) {
      const rows = Array.from({ length: 20 }, (_, index): Row => [`i${index}`, nextPrice(), people]);
      const subtotal = rows.reduce((sum, [, amount]) => sum + amount, 0);
      const [first, ...rest] = rows;
      const { shares } = computeShares(
        splitWith({
          items: [first, ...rest],
          adjustments: [
            ["tax", Math.round(subtotal * 0.08875)],
            ["tip", Math.round(subtotal * 0.2)],
          ],
          participants: [host, ...others],
        }),
      );
      const total = shares.reduce((sum, { share }) => sum + share, 0);
      worst = Math.max(worst, ...shares.map(({ share }) => Math.abs(share - total / 12)));
    }

    expect(worst).toBeLessThan(1);
  });

  test("with mixed claimer sets no Participant is favored on average, and no Share misses exact by 6 cents", () => {
    const people = Array.from({ length: 12 }, (_, index) => `p${String(index).padStart(2, "0")}`);
    const [host, ...others] = people;
    let state = 11;
    const next = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
    const drift = new Map(people.map((id) => [id, 0]));
    let worst = 0;
    const receipts = 500;
    for (let receipt = 0; receipt < receipts; receipt++) {
      const rows = Array.from({ length: 20 }, (_, index): Row => {
        const claimers = people.filter(() => next() < 0.5);
        return [`i${index}`, 100 + Math.floor(next() * 4900), claimers.length > 0 ? claimers : [host]];
      });
      const subtotal = rows.reduce((sum, [, amount]) => sum + amount, 0);
      const tax = Math.round(subtotal * 0.08875);
      const tip = Math.round(subtotal * 0.2);
      const total = subtotal + tax + tip;
      const exact = new Map(people.map((id) => [id, 0]));
      for (const [, amount, claimers] of rows) {
        for (const id of claimers) exact.set(id, (exact.get(id) ?? 0) + (total * amount) / subtotal / claimers.length);
      }
      const [first, ...rest] = rows;
      const { shares } = computeShares(
        splitWith({ items: [first, ...rest], adjustments: [["tax", tax], ["tip", tip]], participants: [host, ...others] }),
      );
      for (const { participantId, share } of shares) {
        const miss = share - (exact.get(participantId) ?? 0);
        drift.set(participantId, (drift.get(participantId) ?? 0) + miss);
        worst = Math.max(worst, Math.abs(miss));
      }
    }

    expect(Math.max(...[...drift.values()].map((total) => Math.abs(total / receipts)))).toBeLessThan(0.5);
    expect(worst).toBeLessThan(6);
  });

  test("a $100,000.00 Item split thirty ways stays exact to the cent", () => {
    const people = Array.from({ length: 30 }, (_, index) => `p${String(index).padStart(2, "0")}`);
    const [host, ...others] = people;
    const { shares } = computeShares(splitWith({ items: [["big", MAX_CENTS, people]], participants: [host, ...others] }));

    const counts = new Map<number, number>();
    for (const { share } of shares) counts.set(share, (counts.get(share) ?? 0) + 1);
    expect([...counts].sort(([a], [b]) => a - b)).toEqual([
      [333_333, 20],
      [333_334, 10],
    ]);
    expect(shares.reduce((sum, { share }) => sum + share, 0)).toBe(10_000_000);
  });

  test("the largest total times the largest price stays exact, with remainders on both Items", () => {
    const people = Array.from({ length: 30 }, (_, index) => `p${String(index).padStart(2, "0")}`);
    const [host, ...others] = people;
    const { shares, unclaimed } = computeShares(
      splitWith({
        items: [
          ["steak", 9_999_998, people],
          ["mint", 1, ["p29"]],
        ],
        adjustments: [["serviceCharge", 1]],
        participants: [host, ...others],
      }),
    );

    expect(shares.filter(({ share }) => share !== 333_333).map(({ participantId, share }) => [participantId, share])).toEqual([
      ["p00", 333_334],
      ["p22", 333_334],
      ["p23", 333_334],
      ["p24", 333_334],
      ["p25", 333_334],
      ["p26", 333_334],
      ["p27", 333_334],
      ["p28", 333_334],
      ["p29", 333_335],
    ]);
    expect(shares.reduce((sum, { share }) => sum + share, 0) + unclaimed.total).toBe(MAX_CENTS);
  });
});
