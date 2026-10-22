import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cents } from "./core/money";
import { participantId, type Split } from "./core/split";
import { mintedId } from "./core/test-ids";
import { topgolf } from "./core/topgolf.fixture";
import { forgetSplit, noteSplit, recentSplits, rememberSplit, splitOnDevice } from "./device";

class MemoryStorage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 4, 12);
const idOf = (n: number) => `split-${String(n).padStart(16, "0")}`;

const splitOf = (n: number, names: string[] = ["Jason", "Sam"], total = 1000 + n): Split => {
  const base = topgolf();
  const [host, ...others] = names.map((name, i) => ({ id: participantId(`p${i}`), name }));
  return { ...base, id: mintedId(idOf(n)), participants: [host!, ...others], receipt: { ...base.receipt, total: cents(total) } };
};

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => vi.unstubAllGlobals());

const listed = (now = T0) => recentSplits(now).map(({ id, names, total, added }) => ({ id, names, total, added }));

describe("recent splits on this device", () => {
  test("list newest first by the day this device first saw them, with their names and total", () => {
    noteSplit(splitOf(1, ["Jason", "Sam"], 4210), T0 - 2 * DAY);
    noteSplit(splitOf(2, ["Ana", "Ben", "Cy"], 990), T0 - DAY);
    expect(listed()).toEqual([
      { id: idOf(2), names: ["Ana", "Ben", "Cy"], total: 990, added: T0 - DAY },
      { id: idOf(1), names: ["Jason", "Sam"], total: 4210, added: T0 - 2 * DAY },
    ]);
  });

  test("remember this device's place in the names: the Host's on the device that made the Split, else the person it picked", () => {
    rememberSplit(mintedId(idOf(1)), { creatorSecret: "secret" });
    noteSplit(splitOf(1, ["Jason", "Sam"]), T0);
    rememberSplit(mintedId(idOf(2)), { me: participantId("p1") });
    noteSplit(splitOf(2, ["Ana", "Ben", "Cy"]), T0);
    noteSplit(splitOf(3, ["Kim", "Lee"]), T0);
    const placed = Object.fromEntries(recentSplits(T0).map(({ id, you }) => [id, you]));
    expect(placed).toEqual({ [idOf(1)]: 0, [idOf(2)]: 1, [idOf(3)]: undefined });
  });

  test("list a Split with the place it kept, and one without a place as before", () => {
    noteSplit({ ...splitOf(1), place: "Dinefine Restaurant" }, T0 - DAY);
    noteSplit(splitOf(2), T0);
    expect(recentSplits(T0).map(({ id, place }) => [id, place])).toEqual([
      [idOf(2), undefined],
      [idOf(1), "Dinefine Restaurant"],
    ]);
  });

  test("drop a Recent entry written before entries were versioned, keeping the creator secret, name and way to pay", () => {
    const old = { names: ["Jason", "Sam"], you: 0, total: 1001, added: T0 - DAY, seen: T0 - DAY };
    const key = (n: number) => `receipt-splitter:split:${idOf(n)}`;
    storage.setItem(key(1), JSON.stringify({ creatorSecret: "secret", me: "p0", payWith: "zelle", recent: old }));
    storage.setItem(key(2), JSON.stringify({ recent: old }));
    expect(recentSplits(T0)).toEqual([]);
    expect(JSON.parse(storage.getItem(key(1)) ?? "null")).toEqual({ creatorSecret: "secret", me: "p0", payWith: "zelle" });
    expect(storage.getItem(key(2))).toBeNull();
    expect(splitOnDevice(mintedId(idOf(1)))).toEqual({ creatorSecret: "secret", me: "p0", payWith: "zelle" });
  });

  test("clear old entries when a Split is noted too, and list that Split again with its place", () => {
    const old = { names: ["Ann", "Bo"], total: 500, added: T0 - 2 * DAY, seen: T0 - 2 * DAY };
    storage.setItem(`receipt-splitter:split:${idOf(1)}`, JSON.stringify({ me: "p1", recent: old }));
    storage.setItem(`receipt-splitter:split:${idOf(2)}`, JSON.stringify({ recent: old }));
    noteSplit({ ...splitOf(1, ["Ann", "Bo"], 500), place: "Joe\u2019s Diner" }, T0);
    expect(storage.getItem(`receipt-splitter:split:${idOf(2)}`)).toBeNull();
    expect(recentSplits(T0).map(({ id, names, place, added }) => ({ id, names, place, added }))).toEqual([{ id: idOf(1), names: ["Ann", "Bo"], place: "Joe\u2019s Diner", added: T0 }]);
    expect(splitOnDevice(mintedId(idOf(1)))).toEqual({ me: "p1" });
  });

  test("list every Split within 60 days, not only the five newest", () => {
    for (let n = 1; n <= 7; n++) noteSplit(splitOf(n), T0 - (10 - n) * DAY);
    expect(listed().map(({ id }) => id)).toEqual([7, 6, 5, 4, 3, 2, 1].map(idOf));
  });

  test("keep a reopened Split's day and place, and take its new names and total", () => {
    noteSplit(splitOf(1), T0 - 3 * DAY);
    noteSplit(splitOf(2), T0 - 2 * DAY);
    noteSplit(splitOf(1, ["Jason", "Sam", "Priya"], 5000), T0);
    expect(listed()).toEqual([
      { id: idOf(2), names: ["Jason", "Sam"], total: 1002, added: T0 - 2 * DAY },
      { id: idOf(1), names: ["Jason", "Sam", "Priya"], total: 5000, added: T0 - 3 * DAY },
    ]);
  });

  test("drop a Split 60 days after this device last opened it", () => {
    noteSplit(splitOf(1), T0 - 90 * DAY);
    noteSplit(splitOf(1), T0 - 61 * DAY);
    noteSplit(splitOf(2), T0 - 90 * DAY);
    noteSplit(splitOf(2), T0 - 59 * DAY);
    expect(listed().map(({ id }) => id)).toEqual([idOf(2)]);
  });

  test("forget a Split whose link says it has expired", () => {
    noteSplit(splitOf(1), T0 - DAY);
    noteSplit(splitOf(2), T0);
    forgetSplit(splitOf(2).id);
    expect(listed().map(({ id }) => id)).toEqual([idOf(1)]);
    expect(splitOnDevice(splitOf(2).id)).toEqual({});
  });

  test("keep at most 50 Splits, dropping the oldest first", () => {
    for (let n = 1; n <= 51; n++) noteSplit(splitOf(n), T0 - (60 - n) * 60_000);
    const kept = [...storage.values.keys()].filter((key) => key.startsWith("receipt-splitter:split:"));
    expect([kept.length, kept.includes(`receipt-splitter:split:${idOf(1)}`), kept.includes(`receipt-splitter:split:${idOf(2)}`)]).toEqual([50, false, true]);
  });

  test("keep the way to pay this device picked beside its name, and drop a stored way that is not a payment app", () => {
    const split = splitOf(1);
    rememberSplit(split.id, { me: participantId("p1") });
    rememberSplit(split.id, { payWith: "zelle" });
    expect(splitOnDevice(split.id)).toEqual({ me: "p1", payWith: "zelle" });
    storage.setItem(`receipt-splitter:split:${split.id}`, JSON.stringify({ me: "p1", payWith: "bitcoin" }));
    expect(splitOnDevice(split.id)).toEqual({ me: "p1" });
  });

  test("keep the pick and the Creator secret through a note, and the entry through a pick", () => {
    const split = splitOf(1);
    rememberSplit(split.id, { creatorSecret: "secret" });
    noteSplit(split, T0);
    rememberSplit(split.id, { me: participantId("p1") });
    expect(splitOnDevice(split.id)).toEqual({ creatorSecret: "secret", me: "p1" });
    expect(listed().map(({ id }) => id)).toEqual([idOf(1)]);
  });

  test("list nothing from bad JSON, a record from before this list, a malformed entry, or other keys", () => {
    storage.setItem(`receipt-splitter:split:${idOf(1)}`, "{not json");
    storage.setItem(`receipt-splitter:split:${idOf(2)}`, JSON.stringify({ creatorSecret: "secret" }));
    storage.setItem(`receipt-splitter:split:${idOf(3)}`, JSON.stringify({ recent: { names: "Jason", total: 5, added: T0, seen: T0 } }));
    storage.setItem("receipt-splitter:draft", JSON.stringify({ version: 2, handles: [] }));
    expect(listed()).toEqual([]);
  });

  test("keep a pre-list record's Creator secret and pick when 50 newer Splits are listed", () => {
    storage.setItem(`receipt-splitter:split:${idOf(900)}`, '{"creatorSecret":"old","me":"p1","shared":true}');
    for (let n = 1; n <= 51; n++) noteSplit(splitOf(n), T0 - (60 - n) * 60_000);
    expect(splitOnDevice(splitOf(900).id)).toEqual({ creatorSecret: "old", me: "p1" });
    expect(storage.getItem(`receipt-splitter:split:${idOf(1)}`)).toBeNull();
  });

  test("keep a Creator secret and pick when its Split falls past the 50 and leaves the list", () => {
    const first = splitOf(1);
    rememberSplit(first.id, { creatorSecret: "secret", me: participantId("p1") });
    noteSplit(first, T0 - 100 * 60_000);
    for (let n = 2; n <= 51; n++) noteSplit(splitOf(n), T0 - (60 - n) * 60_000);
    expect(splitOnDevice(first.id)).toEqual({ creatorSecret: "secret", me: "p1" });
    expect(listed().map(({ id }) => id)).not.toContain(idOf(1));
  });
});

describe("blocked storage", () => {
  test("a throwing localStorage getter lists nothing and does not stop a note", () => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      expect(recentSplits(T0)).toEqual([]);
      expect(() => noteSplit(splitOf(1), T0)).not.toThrow();
      expect(splitOnDevice(splitOf(1).id)).toEqual({});
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  test("a throwing key() lists nothing and does not stop a note", () => {
    vi.stubGlobal("localStorage", {
      length: 2,
      key() {
        throw new Error("blocked");
      },
      getItem: () => null,
      setItem() {},
      removeItem() {},
    });
    expect(recentSplits(T0)).toEqual([]);
    expect(() => noteSplit(splitOf(1), T0)).not.toThrow();
  });
});
