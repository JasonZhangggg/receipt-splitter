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

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const MENU_PRICES = [0, 100, 250, 333, 500, 899, 1000, 1250, 1999, 4500];

function seededReceipts(count: number) {
  const next = random(2026);
  const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));
  return Array.from({ length: count }, () => {
    const [host, ...others] = Array.from({ length: int(2, 12) }, (_, index) => `${int(0, 46_655).toString(36)}_${index}`);
    const people = [host, ...others];
    const claimerSets: string[][] = [];
    for (let start = 0; start < people.length; ) {
      const size = int(1, 4);
      claimerSets.push(people.slice(start, start + size));
      start += size;
    }
    const rows = Array.from({ length: int(1, 20) }, (_, index): Row => {
      const claimers = claimerSets.filter(() => next() < 0.45).flat();
      const fallback = next() < 0.8 ? claimerSets[int(0, claimerSets.length - 1)] : [];
      const amount = next() < 0.5 ? MENU_PRICES[int(0, MENU_PRICES.length - 1)] : int(1, 5000);
      return [`i${index}`, amount, claimers.length > 0 ? claimers : fallback];
    });
    const subtotal = rows.reduce((sum, [, amount]) => sum + amount, 0);
    const adjustments: [AdjustmentKind, number][] = [
      ["tax", Math.round(subtotal * 0.08875)],
      ["tip", Math.round(subtotal * [0.18, 0.2, 0.22][int(0, 2)])],
    ];
    if (next() < 0.15) adjustments.push(["discount", -Math.min(subtotal, int(100, 800))]);
    const [first, ...rest] = rows;
    return {
      split: splitWith({ items: [first, ...rest], adjustments, participants: [host, ...others] }),
      twins: claimerSets.filter((set) => set.length > 1),
    };
  });
}

function exactShares({ receipt }: Pick<Split, "receipt">) {
  const weights = receipt.items.some(({ price }) => price > 0) ? receipt.items.map(({ price }) => price) : receipt.items.map(() => 1);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = new Map<string, number>();
  let unclaimed = 0;
  receipt.items.forEach(({ claimedBy }, index) => {
    const load = (receipt.total * weights[index]) / weightSum;
    if (claimedBy.length === 0) unclaimed += load;
    for (const id of claimedBy) shares.set(id, (shares.get(id) ?? 0) + load / claimedBy.length);
  });
  return { shares, unclaimed };
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

  test("the extra cent of an even three-way split lands on the lowest id about a third of the time", () => {
    const next = random(334);
    const receipts = 3_000;
    let lowestPaidMore = 0;
    for (let receipt = 0; receipt < receipts; receipt++) {
      const people = Array.from({ length: 3 }, (_, index) => `${Math.floor(next() * 46_656).toString(36)}_${index}`);
      const [host, ...others] = people;
      const { shares } = computeShares(splitWith({ items: [["nachos", 1000, people]], participants: [host, ...others] }));
      const lowest = [...people].sort()[0];
      if (shares.find(({ participantId }) => participantId === lowest)?.share === 334) lowestPaidMore += 1;
    }

    expect(lowestPaidMore / receipts).toBeGreaterThan(0.3);
    expect(lowestPaidMore / receipts).toBeLessThan(0.37);
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

  test("the Unclaimed items total loses a tie for the last cent to a Participant", () => {
    const shares = computeShares(
      splitWith({
        items: [
          ["steak", 100, ["ann"]],
          ["wine", 100, []],
        ],
        adjustments: [["tip", 1]],
      }),
    );

    expect(shareCents(shares)).toEqual([
      ["ann", 101],
      ["bob", 0],
      ["cat", 0],
    ]);
    expect(shares.unclaimed).toEqual({ itemIds: ["wine"], subtotal: 100, total: 100 });
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
      ["ann", 4060],
      ["bob", 1675],
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

  test("three $10.00 Items shared by the same three Participants cost each exactly $10.00", () => {
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

  test("two Participants who Claim the same Items pay the same, whatever else the third Claims", () => {
    const shares = computeShares(
      splitWith({
        items: [
          ["pizza", 500, ["a", "b", "c"]],
          ["fries", 100, ["a", "b"]],
        ],
        adjustments: [
          ["tax", 53],
          ["tip", 120],
        ],
        participants: ["a", "b", "c"],
      }),
    );

    expect(shareCents(shares)).toEqual([
      ["a", 279],
      ["b", 279],
      ["c", 215],
    ]);
  });

  test("every Share and the Unclaimed total land strictly within 1 cent of exact, and identical claimers within 1 cent of each other, across 3,000 seeded receipts", () => {
    let worst = 0;
    let widestTwinGap = 0;
    for (const { split, twins } of seededReceipts(3_000)) {
      const { shares, unclaimed } = computeShares(split);
      const exact = exactShares(split);
      const misses = [
        ...shares.map(({ participantId, share }) => share - (exact.shares.get(participantId) ?? 0)),
        unclaimed.total - exact.unclaimed,
      ];
      worst = Math.max(worst, ...misses.map(Math.abs));
      expect(shares.reduce((sum, { share }) => sum + share, 0) + unclaimed.total).toBe(split.receipt.total);
      const byId = new Map<string, number>(shares.map(({ participantId, share }) => [participantId, share]));
      for (const set of twins) {
        const paid = set.map((id) => byId.get(id) ?? 0);
        widestTwinGap = Math.max(widestTwinGap, Math.max(...paid) - Math.min(...paid));
      }
    }

    expect(worst).toBeLessThan(1);
    expect(widestTwinGap).toBe(1);
  });

  test("a Claim moves a claimer's Share by the exact amount within 2 cents, since each side rounds on its own", () => {
    const withNachos = (nachosClaimers: readonly string[]) =>
      shareCents(
        computeShares(
          splitWith({
            items: [
              ["nachos", 335, nachosClaimers],
              ["wings", 834, ["p0", "p1", "p2"]],
            ],
            adjustments: [["tax", 137]],
            participants: ["p0", "p1", "p2"],
          }),
        ),
      );

    expect(withNachos(["p0", "p1", "p2"])).toEqual([
      ["p0", 435],
      ["p1", 436],
      ["p2", 435],
    ]);
    expect(withNachos(["p0", "p2"])).toEqual([
      ["p0", 498],
      ["p1", 310],
      ["p2", 498],
    ]);
  });

  test("Shares do not depend on the order of the Receipt rows", () => {
    for (const { split } of seededReceipts(300)) {
      const [first, ...rest] = [...split.receipt.items].reverse();
      const reversed = { ...split, receipt: { ...split.receipt, items: [first, ...rest] as const } };

      expect(computeShares(reversed).shares).toEqual(computeShares(split).shares);
    }
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
    let charged = 0;
    for (let receipt = 0; receipt < 200; receipt++) {
      const rows = Array.from({ length: 20 }, (_, index): Row => [`i${index}`, nextPrice(), people]);
      const subtotal = rows.reduce((sum, [, amount]) => sum + amount, 0);
      const tax = Math.round(subtotal * 0.08875);
      const tip = Math.round(subtotal * 0.2);
      const [first, ...rest] = rows;
      const { shares } = computeShares(
        splitWith({
          items: [first, ...rest],
          adjustments: [
            ["tax", tax],
            ["tip", tip],
          ],
          participants: [host, ...others],
        }),
      );
      charged += shares.reduce((sum, { share }) => sum + share, 0);
      worst = Math.max(worst, ...shares.map(({ share }) => Math.abs(share - (subtotal + tax + tip) / 12)));
    }

    expect(charged).toBe(13_116_903);
    expect(worst).toBeLessThan(1);
  });

  test("with mixed claimer sets no Participant is favored on average, and no Share misses exact by 1 cent", () => {
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

    expect(Math.max(...[...drift.values()].map((total) => Math.abs(total / receipts)))).toBeLessThan(0.1);
    expect(worst).toBeLessThan(1);
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
      ["p02", 333_334],
      ["p05", 333_334],
      ["p07", 333_334],
      ["p11", 333_334],
      ["p16", 333_334],
      ["p18", 333_334],
      ["p22", 333_334],
      ["p27", 333_334],
      ["p29", 333_335],
    ]);
    expect(shares.reduce((sum, { share }) => sum + share, 0) + unclaimed.total).toBe(MAX_CENTS);
  });

  test("at the caps, with every claimer count from 1 to 30 and a MAX_CENTS total, each Share stays within 1 cent of exact", () => {
    const people = Array.from({ length: 30 }, (_, index) => `p${String(index).padStart(2, "0")}`);
    const [host, ...others] = people;
    const rows = Array.from({ length: 100 }, (_, index): Row => [`i${index}`, 97_001 + index, people.slice(0, 1 + (index % 30))]);
    const subtotal = rows.reduce((sum, [, amount]) => sum + amount, 0);
    const [first, ...rest] = rows;
    const split = splitWith({ items: [first, ...rest], adjustments: [["tip", MAX_CENTS - subtotal]], participants: [host, ...others] });
    const { shares, unclaimed } = computeShares(split);
    const exact = exactShares(split);

    expect(split.receipt.total).toBe(MAX_CENTS);
    expect(shares.reduce((sum, { share }) => sum + share, 0) + unclaimed.total).toBe(MAX_CENTS);
    expect(Math.max(...shares.map(({ participantId, share }) => Math.abs(share - (exact.shares.get(participantId) ?? 0))))).toBeLessThan(1);
  });
});
