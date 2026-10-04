import { describe, expect, test } from "vitest";
import { MAX_CENTS, cents, price, type Cents } from "./money";
import { applyOperation } from "./operations";
import { computeShares, shareBreakdown, unitPrices, type ShareBreakdown, type Shares } from "./shares";
import { adjustmentId, itemId, participantId, type Adjustment, type ItemSplit, type Part, type ParticipantId, type ReceiptLevelKind, type Split, type SplitItem } from "./split";
import { bucketOne, bucketTwo, eachOf, jason, priya, topgolf } from "./topgolf.fixture";

type Row = readonly [id: string, price: number, claimers: readonly string[]];

function splitWith(options: {
  items: readonly [Row, ...Row[]];
  adjustments?: readonly (readonly [kind: ReceiptLevelKind, amount: number])[];
  participants?: readonly [string, ...string[]];
  payments?: readonly (readonly [who: string, amount: number])[];
}): Pick<Split, "receipt" | "participants" | "payments"> {
  const toItem = ([id, amount, claimers]: Row): SplitItem => ({
    id: itemId(id),
    name: id,
    price: price(amount),
    split: { by: "even", units: [[...claimers].sort().map(participantId)] },
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
    const adjustments: [ReceiptLevelKind, number][] = [
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
  receipt.items.forEach(({ split }, index) => {
    const claimedBy = split.by === "even" ? split.units[0] : [];
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
    expect(shares.unclaimed).toEqual({ itemIds: ["salad"], total: 1289 });
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
    expect(shares.unclaimed).toEqual({ itemIds: ["wine"], total: 100 });
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
    expect(shares.unclaimed).toEqual({ itemIds: [], total: 0 });
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

describe("unitPrices", () => {
  test("splits a line into unit prices that add up to it, the first units taking the extra cents", () => {
    expect([unitPrices(1000, 3), unitPrices(2187, 3), unitPrices(1001, 3), unitPrices(5, 1), unitPrices(0, 2)]).toEqual([
      [334, 333, 333],
      [729, 729, 729],
      [334, 334, 333],
      [5],
      [0, 0],
    ]);
  });
});

describe("Item quantity and split modes", () => {
  const ids = (names: string) => (names ? names.split(",").map(participantId) : []);
  const weighted = (names: Record<string, number>) => Object.entries(names).map(([id, value]): [ParticipantId, number] => [participantId(id), value]);
  const amounts = (names: Record<string, number>) => Object.entries(names).map(([id, value]): Part<Cents> => [participantId(id), cents(value)]);
  const withSplit = (split: ReturnType<typeof splitWith>, id: string, shape: ItemSplit): ReturnType<typeof splitWith> => {
    const [first, ...rest] = split.receipt.items.map((item) => (item.id === id ? { ...item, split: shape } : item));
    return { ...split, receipt: { ...split.receipt, items: [first, ...rest] } };
  };
  const tostones = (shape: ItemSplit, adjustments: readonly (readonly [ReceiptLevelKind, number])[] = []) =>
    withSplit(splitWith({ items: [["tostones", 100, []]], adjustments }), "tostones", shape);

  test("a $1.00 Item split 2:1 by shares costs 67 and 33 cents", () => {
    expect(shareCents(computeShares(tostones({ by: "shares", units: [weighted({ ann: 2, bob: 1 })] })))).toEqual([
      ["ann", 67],
      ["bob", 33],
      ["cat", 0],
    ]);
  });

  test("a $1.00 Item split by amount as 75 and 25 cents costs exactly that", () => {
    expect(shareCents(computeShares(tostones({ by: "amount", units: [amounts({ ann: 75, bob: 25 })] })))).toEqual([
      ["ann", 75],
      ["bob", 25],
      ["cat", 0],
    ]);
  });

  test("the 10 cents an amount split leaves is Unclaimed, with its part of the tax", () => {
    const split = withSplit(splitWith({ items: [["tostones", 100, []], ["rice", 900, ["cat"]]], adjustments: [["tax", 100]] }), "tostones", {
      by: "amount",
      units: [amounts({ ann: 60, bob: 30 })],
    });
    const { shares, unclaimed } = computeShares(split);

    expect(shares.map(({ share }) => share)).toEqual([66, 33, 990]);
    expect(unclaimed).toEqual({ itemIds: ["tostones"], total: 11 });
    expect(shareBreakdown(split, participantId("ann")).items).toEqual([{ id: "tostones", name: "tostones", price: 100, fraction: [3, 5], portion: 60 }]);
  });

  test("two $12.00 pitchers on one line claimed by Jason, Sam, and Priya cost $8.00 each, and the breakdown lists the line once with its quantity", () => {
    const line = withSplit(splitWith({ items: [["pitchers", 2400, []]], participants: ["jason", "sam", "priya"] }), "pitchers", { by: "even", units: [ids("jason,priya,sam")] });
    const [first, ...rest] = line.receipt.items.map((item) => ({ ...item, quantity: 2 }));
    const split = { ...line, receipt: { ...line.receipt, items: [first, ...rest] as const } };

    expect(computeShares(split).shares.map(({ share }) => share)).toEqual([800, 800, 800]);
    expect(shareBreakdown(split, participantId("sam")).items).toEqual([{ id: "pitchers", name: "pitchers", price: 2400, quantity: 2, fraction: [1, 3], portion: 800 }]);
  });

  test("the design's dinner: Jason and Sam owe $12.06, Priya $3.55, and $4.97 is Unclaimed out of $32.64", () => {
    const dinner = splitWith({
      items: [
        ["rice", 799, ["jason"]],
        ["tropic", 799, ["sam"]],
        ["tostones", 100, ["jason", "sam"]],
        ["sprite", 250, ["priya"]],
        ["perrier", 350, []],
      ],
      adjustments: [["tax", 161], ["serviceCharge", 345], ["tip", 460]],
      participants: ["jason", "sam", "priya", "lee"],
    });
    const { shares, unclaimed } = computeShares(dinner);

    expect(shares.map(({ share }) => share)).toEqual([1206, 1206, 355, 0]);
    expect(unclaimed.total).toBe(497);
    expect(shares.reduce((total: number, { share }) => total + share, unclaimed.total)).toBe(3264);
  });

  test("across 300 seeded receipts with random quantities and modes, Shares and the Unclaimed total add up to the total, and every breakdown adds up to its Share", () => {
    const next = random(88);
    const misses: string[] = [];
    for (const { split: plain } of seededReceipts(300)) {
      const people = plain.participants.map(({ id }) => id);
      const [first, ...rest] = plain.receipt.items.map((item): SplitItem => {
        const quantity = 1 + Math.floor(next() * 3);
        const line = quantity === 1 ? item : { ...item, quantity };
        const claimers = people.filter(() => next() < 0.3).sort();
        const roll = next();
        if (roll < 0.33) return { ...line, split: { by: "even", units: [claimers] } };
        if (roll < 0.66) return { ...line, split: { by: "shares", units: [claimers.map((id): Part<number> => [id, 1 + Math.floor(next() * 4)])] } };
        let left = item.price as number;
        const amounts = claimers.map((id): Part<Cents> => {
          const cents = Math.floor(next() * (left + 1)) as Cents;
          left -= cents;
          return [id, cents];
        });
        return { ...line, split: { by: "amount", units: [amounts] } };
      });
      const split = { ...plain, receipt: { ...plain.receipt, items: [first, ...rest] as const } };
      const { shares, unclaimed } = computeShares(split);
      const sumOfShares = shares.reduce((total, { share }) => total + share, 0) + unclaimed.total;
      if (sumOfShares !== split.receipt.total) misses.push(`shares ${sumOfShares} total ${split.receipt.total}`);
      for (const { participantId: id, share } of shares) {
        const breakdown = shareBreakdown(split, id);
        const lines = [...breakdown.items, ...breakdown.adjustments].reduce((total, { portion }) => total + portion, 0);
        if (lines !== share) misses.push(`${id} lines ${lines} share ${share}`);
      }
    }

    expect(misses).toEqual([]);
  });
});

describe("shareBreakdown", () => {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  const linesOf = ({ items, adjustments, difference }: ShareBreakdown) => sum([...items, ...adjustments].map(({ portion }) => portion)) + difference;

  test("a third of a $30.00 pitcher and all of the fries, with tax and tip in proportion, add up to the Share", () => {
    const split = splitWith({ items: [["pitcher", 3000, ["ann", "bob", "cat"]], ["fries", 900, ["bob"]]], adjustments: [["tax", 390], ["tip", 780]] });

    expect(shareBreakdown(split, participantId("bob"))).toEqual({
      items: [
        { id: "pitcher", name: "pitcher", price: 3000, fraction: [1, 3], portion: 1000 },
        { id: "fries", name: "fries", price: 900, fraction: [1, 1], portion: 900 },
      ],
      adjustments: [
        { id: "tax", kind: "tax", name: "tax", portion: 190 },
        { id: "tip", kind: "tip", name: "tip", portion: 380 },
      ],
      difference: 0,
      share: 2470,
    });
  });

  test("a $10.00 Item split three ways gives each claimer 333 or 334 cents of it, and every breakdown adds up to its Share", () => {
    const split = splitWith({ items: [["cake", 1000, ["ann", "bob", "cat"]]], adjustments: [["tax", 100]] });
    const shares = computeShares(split);

    const breakdowns = ["ann", "bob", "cat"].map((id) => shareBreakdown(split, participantId(id)));

    expect(breakdowns.map(({ items }) => items[0].portion).sort()).toEqual([333, 333, 334]);
    expect(breakdowns.map(linesOf)).toEqual(shares.shares.map(({ share }) => share));
    expect(sum(breakdowns.map(linesOf))).toBe(1100);
  });

  test("someone with no Claims sees no Items, no part of tax or tip, and a $0.00 Share", () => {
    const split = splitWith({ items: [["pitcher", 3000, ["ann"]]], adjustments: [["tax", 300]] });

    expect(shareBreakdown(split, participantId("cat"))).toEqual({ items: [], adjustments: [{ id: "tax", kind: "tax", name: "tax", portion: 0 }], difference: 0, share: 0 });
  });

  test("an Unclaimed item shows in no one's breakdown, and its part of tax and tip stays out of every line", () => {
    const split = splitWith({ items: [["burger", 2000, ["ann"]], ["salad", 1000, []]], adjustments: [["tax", 266], ["tip", 600]] });

    expect(["ann", "bob"].map((id) => shareBreakdown(split, participantId(id)))).toEqual([
      {
        items: [{ id: "burger", name: "burger", price: 2000, fraction: [1, 1], portion: 2000 }],
        adjustments: [
          { id: "tax", kind: "tax", name: "tax", portion: 177 },
          { id: "tip", kind: "tip", name: "tip", portion: 400 },
        ],
        difference: 0,
        share: 2577,
      },
      {
        items: [],
        adjustments: [
          { id: "tax", kind: "tax", name: "tax", portion: 0 },
          { id: "tip", kind: "tip", name: "tip", portion: 0 },
        ],
        difference: 0,
        share: 0,
      },
    ]);
  });

  test("a third of a $13.68 platter with a $2.09 discount, $0.20 tax, and $0.26 tip shows -$0.70, $0.07, and $0.08 or $0.09 for each person", () => {
    const split = splitWith({ items: [["platter", 1368, ["ann", "bob", "cat"]]], adjustments: [["discount", -209], ["tax", 20], ["tip", 26]] });

    expect(["ann", "bob", "cat"].map((id) => shareBreakdown(split, participantId(id)).adjustments.map(({ portion }) => portion))).toEqual([
      [-70, 7, 9],
      [-70, 7, 8],
      [-70, 7, 9],
    ]);
  });

  test("when the Items run over the printed subtotal, each Item line and each Adjustment line keeps its own cents, and a difference line brings them to the Share", () => {
    const fair = splitWith({ items: [["tropic", 799, ["sam"]], ["tostones", 100, ["ann", "bob", "sam"]], ["sprite", 275, ["bob"]]], adjustments: [["tax", 100]], participants: ["ann", "bob", "sam"] });
    const over = { ...fair, receipt: { ...fair.receipt, subtotal: cents(1149), total: cents(1249) } };
    const breakdown = shareBreakdown(over, participantId("sam"));

    expect(breakdown.items[0].portion).toBe(799);
    expect([33, 34]).toContain(breakdown.items[1].portion);
    expect(breakdown.adjustments.map(({ portion }) => portion)).toEqual([71]);
    expect(breakdown.difference).toBe(-17);
    expect(linesOf(breakdown)).toBe(breakdown.share);
  });

  test("a $0.00 tip stays $0.00 on a receipt whose Items run over the subtotal", () => {
    const fair = splitWith({ items: [["rice", 800, ["ann"]], ["sprite", 275, ["bob"]]], adjustments: [["tax", 100], ["tip", 0]], participants: ["ann", "bob"] });
    const over = { ...fair, receipt: { ...fair.receipt, subtotal: cents(1050), total: cents(1150) } };

    expect(shareBreakdown(over, participantId("ann")).adjustments.map(({ portion }) => portion)).toEqual([74, 0]);
  });

  test("a $0.00 tip stays $0.00 when tax rounds against the Items: $2.23 split three ways and $18.20 split two ways with $1.81 tax", () => {
    const split = splitWith({ items: [["chips", 223, ["a", "b", "c"]], ["steak", 1820, ["a", "d"]]], adjustments: [["tax", 181], ["tip", 0]], participants: ["a", "b", "c", "d"] });

    expect(shareBreakdown(split, participantId("a"))).toEqual({
      items: [
        { id: "chips", name: "chips", price: 223, fraction: [1, 3], portion: 74 },
        { id: "steak", name: "steak", price: 1820, fraction: [1, 2], portion: 910 },
      ],
      adjustments: [
        { id: "tax", kind: "tax", name: "tax", portion: 87 },
        { id: "tip", kind: "tip", name: "tip", portion: 0 },
      ],
      difference: 0,
      share: 1071,
    });
  });

  test("a $10.00 discount on $6.00 of Items, $1.00 of it Unclaimed, gives the one who claimed nothing no lines", () => {
    const fair = splitWith({ items: [["pasta", 500, ["ann", "bob"]], ["bread", 100, []]], adjustments: [["discount", -1000]], participants: ["ann", "bob", "cat"] });
    const printed = { ...fair, receipt: { ...fair.receipt, total: cents(300) } };

    expect(shareBreakdown(printed, participantId("cat"))).toEqual({ items: [], adjustments: [{ id: "discount", kind: "discount", name: "discount", portion: 0 }], difference: 0, share: 0 });
  });

  test("a receipt discount shows as a negative line", () => {
    const split = splitWith({ items: [["pitcher", 3000, ["ann"]]], adjustments: [["discount", -300], ["tax", 270]] });

    expect(shareBreakdown(split, participantId("ann")).adjustments.map(({ portion }) => portion)).toEqual([-300, 270]);
  });

  test("across 15,000 seeded receipts with $0.00 lines, Bundles, discounts past the Items, and printed totals that disagree, every line stays between $0.00 and its Item or Adjustment and the lines add up to the Share", () => {
    const next = random(20261001);
    const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));
    const pick = <T,>(values: readonly T[]): T => values[int(0, values.length - 1)];
    const misses: string[] = [];
    for (let run = 0; run < 15_000; run += 1) {
      const people = Array.from({ length: int(1, 6) }, (_, index) => `p${index}`);
      const rows = Array.from({ length: int(1, 6) }, (_, index): SplitItem => {
        const amount = pick([0, 1, 2, 99, 223, 1820, int(0, 5000)]);
        const claimers = people.filter(() => next() < 0.4).map(participantId);
        const counts = claimers.map((id): Part<number> => [id, int(1, 4)]);
        let left = amount;
        const amounts = claimers.map((id): Part<Cents> => {
          const value = cents(int(0, left));
          left -= value;
          return [id, value];
        });
        const split: ItemSplit = pick<ItemSplit>([
          { by: "even", units: [claimers] },
          { by: "shares", units: [counts] },
          { by: "amount", units: [amounts] },
        ]);
        return { id: itemId(`i${index}`), name: `i${index}`, price: price(amount), split };
      });
      const itemsSum = rows.reduce((total, { price }) => total + price, 0);
      const size = () => pick([0, 0, 1, 99, 181, int(0, 900), int(0, itemsSum + 1000)]);
      const receiptLevel = Array.from({ length: int(0, 3) }, (_, index): Adjustment => {
        const kind = pick(["tax", "tip", "serviceCharge", "discount"] as const);
        const amount = size();
        return { id: adjustmentId(`a${index}`), kind, name: kind, amount: cents(kind === "discount" ? -amount : amount) };
      });
      const bundleOfRows = rows.map(() => int(0, 2));
      const bundles = [1, 2].flatMap((bundle): Adjustment[] => {
        const [first, ...rest] = rows.filter((_, index) => bundleOfRows[index] === bundle).map(({ id }) => id);
        return first === undefined ? [] : [{ id: adjustmentId(`b${bundle}`), kind: "bundleDiscount", name: "bundle", amount: cents(-size()), bundle: { name: "bundle", items: [first, ...rest] } }];
      });
      const adjustments = [...receiptLevel, ...bundles];
      const agreeing = adjustments.reduce((total, { amount }) => total + amount, itemsSum);
      const total = Math.max(0, pick([agreeing, agreeing, agreeing + int(-300, 300), 0]));
      const [host, ...others] = people.map((id) => ({ id: participantId(id), name: id }));
      const split = {
        receipt: { items: [rows[0], ...rows.slice(1)] as const, adjustments, subtotal: cents(itemsSum), total: cents(total) },
        participants: [host, ...others] as const,
        payments: [],
      };
      for (const { participantId: id, share } of computeShares(split).shares) {
        const breakdown = shareBreakdown(split, id);
        const where = `receipt ${run} ${id}`;
        if (linesOf(breakdown) !== share || breakdown.share !== share) misses.push(`${where} lines ${linesOf(breakdown)} share ${share}`);
        if (total === agreeing && breakdown.difference !== 0) misses.push(`${where} difference ${breakdown.difference} on an agreeing receipt`);
        for (const { portion, price } of breakdown.items) if (portion < 0 || portion > price) misses.push(`${where} item ${portion} of ${price}`);
        breakdown.adjustments.forEach(({ portion }, index) => {
          const { amount } = adjustments[index];
          if (portion < Math.min(0, amount) || portion > Math.max(0, amount)) misses.push(`${where} adjustment ${portion} of ${amount}`);
        });
      }
    }

    expect(misses.slice(0, 5)).toEqual([]);
  });

  test("across 300 seeded receipts every breakdown adds up to its Share, and each Item part is its price split evenly to the cent", () => {
    const misses: string[] = [];
    for (const { split } of seededReceipts(300)) {
      const { shares } = computeShares(split);
      for (const { participantId: id, share } of shares) {
        const breakdown = shareBreakdown(split, id);
        if (linesOf(breakdown) !== share || breakdown.share !== share) misses.push(`${id} lines ${linesOf(breakdown)} share ${share}`);
        for (const { price, fraction, portion } of breakdown.items) {
          if (Math.abs(portion - (price * fraction[0]) / fraction[1]) >= 1) misses.push(`${id} item ${portion} of ${price} times ${fraction.join("/")}`);
        }
      }
    }

    expect(misses).toEqual([]);
  });
});

describe("Bundles", () => {
  const shareOf = (split: Pick<Split, "receipt" | "participants" | "payments">, who: ParticipantId) =>
    computeShares(split).shares.find(({ participantId }) => participantId === who)?.share;
  const asReceiptDiscounts = (split: Split): Split => ({
    ...split,
    receipt: { ...split.receipt, adjustments: split.receipt.adjustments.map(({ id, kind, name, amount }): Adjustment => ({ id, kind: kind === "bundleDiscount" ? "discount" : kind, name, amount })) },
  });

  test("at Topgolf, Priya on all of the first Beer Bucket owes $49.52 and Jason on Gameplay and the second owes $157.77, where v1 charged Priya $52.21", () => {
    const split = topgolf({ ...eachOf(bucketOne, priya), ...eachOf(["gameplay", ...bucketTwo], jason) });

    expect(computeShares(split)).toEqual({
      shares: [
        { participantId: "jason", share: 15777 },
        { participantId: "priya", share: 4952, paid: 0, owed: 4952 },
      ],
      unclaimed: { itemIds: [], total: 0 },
    });
    expect(shareOf(asReceiptDiscounts(split), priya)).toBe(5221);
  });

  test("a Bundle discount on a unit nobody Claimed stays Unclaimed with its part of the tax", () => {
    const split = splitWith({ items: [["a", 600, ["ann"]], ["b", 400, []], ["c", 1000, ["bob"]]], adjustments: [["tax", 190]] });
    const bundled = { ...split, receipt: { ...split.receipt, adjustments: [...split.receipt.adjustments, bundleOf("a", "b", -100)], total: cents(2090) } };

    expect(computeShares(bundled)).toEqual({
      shares: [
        { participantId: "ann", share: 594 },
        { participantId: "bob", share: 1100, paid: 0, owed: 1100 },
        { participantId: "cat", share: 0, paid: 0, owed: 0 },
      ],
      unclaimed: { itemIds: ["b"], total: 396 },
    });
  });

  test("a Bundle discount past its Items takes them to $0.00 and spreads the rest over everyone's Items", () => {
    const split = splitWith({ items: [["a", 500, ["ann"]], ["b", 1000, ["bob"]], ["c", 500, ["cat"]]] });
    const bundled = { ...split, receipt: { ...split.receipt, adjustments: [{ ...bundleOf("a", "a", -800), bundle: { name: "Bundle", items: [itemId("a")] as const } }], total: cents(1200) } };

    expect(computeShares(bundled).shares.map(({ share }) => share)).toEqual([0, 800, 400]);
  });

  test("Guinness claimed by Jason and Priya as one 3x line costs them what the three rows after Split cost them, each row claimed by the same two", () => {
    const claims = { ...eachOf(bucketOne, priya), ...eachOf(["gameplay", ...bucketTwo], jason), guinness1: [jason, priya] };
    const whole = topgolf(claims);
    const rows = applyOperation(whole, { by: jason, type: "editReceipt", items: [{ type: "split", itemId: itemId("guinness1"), ids: [itemId("guinness1-b"), itemId("guinness1-c")] }] }, { creator: false });
    if (!rows.ok) throw new Error(JSON.stringify(rows.rejection));

    expect(rows.split.receipt.items.filter(({ name }) => name.startsWith("Guinness")).map(({ id, price: cents, split }) => [id, cents, split])).toEqual([
      ["guinness1", 729, { by: "even", units: [["jason", "priya"]] }],
      ["guinness1-b", 729, { by: "even", units: [["jason", "priya"]] }],
      ["guinness1-c", 729, { by: "even", units: [["jason", "priya"]] }],
      ["guinness2", 1458, { by: "even", units: [["jason"]] }],
    ]);
    expect(computeShares(whole).shares.map(({ share }) => share)).toEqual([16977, 3752]);
    expect(computeShares(rows.split).shares.map(({ share }) => share)).toEqual([16977, 3752]);
  });

  test("Priya's breakdown shows the first Beer Bucket's whole discount and none of the second's", () => {
    const split = topgolf({ ...eachOf(bucketOne, priya), ...eachOf(["gameplay", ...bucketTwo], jason) });

    expect(shareBreakdown(split, priya).adjustments.map(({ id, portion }) => [id, portion])).toEqual([
      ["bucket1", -451],
      ["bucket2", 0],
      ["tax", 118],
      ["tip", 771],
    ]);
  });

  test("across 2,000 random Topgolf Claims, the Shares plus the Unclaimed total come to $207.29", () => {
    const next = random(1001);
    const people = [jason, priya, participantId("sam")];
    const misses: string[] = [];
    for (let run = 0; run < 2_000; run += 1) {
      const base = topgolf();
      const [first, ...rest] = base.receipt.items.map((item): SplitItem => {
        return { ...item, split: { by: "even", units: [people.filter(() => next() < 0.4)] } };
      });
      const split = { ...base, participants: [...base.participants, { id: people[2], name: "Sam" }] as const, receipt: { ...base.receipt, items: [first, ...rest] as const } };
      const { shares, unclaimed } = computeShares(split);
      const sum = shares.reduce((total: number, { share }) => total + share, unclaimed.total);
      if (sum !== 20729) misses.push(`run ${run}: ${sum}`);
    }

    expect(misses).toEqual([]);
  });
});

function bundleOf(first: string, second: string, amount: number): Adjustment {
  return { id: adjustmentId("bundle"), kind: "bundleDiscount", name: "Bundle", amount: cents(amount), bundle: { name: "Bundle", items: [itemId(first), itemId(second)] } };
}
