/**
 * @typedef {{ k: string, cents: number, bundle?: number, qty?: number, under?: boolean }} TruthLine
 * @typedef {{ items: number[] | null, tax: number, total: number, tip?: number, subtotal?: number, bundles?: { name: string }[], lines?: TruthLine[] }} Truth
 * @typedef {{ name: string, amount: number }} ReadDiscount
 * @typedef {{ name: string, price: number, quantity: number | null, details: string[], discounts: ReadDiscount[] }} ReadItem
 * @typedef {{ items: ReadItem[], bundles: { name: string, items: number[], discounts: ReadDiscount[] }[], adjustments: { kind: string, name: string, amount: number }[], subtotal: unknown, total: number, check: { passed: boolean } }} ScanReply
 * @typedef {{ count: boolean, members: boolean, discounts: boolean, outside: boolean, right: boolean }} BundleScore
 * @typedef {{ full: boolean, itemsF1: number | null, split: boolean | null, bundles: BundleScore | null, taxRight: boolean, totalRight: boolean, reconciles: boolean, checkPassed: boolean }} Score
 * @typedef {{ id: string, status: number | null, ms: number, cost: number | null, passes: number | null, score: Score }} RunResult
 */

const sum = (/** @type {number[]} */ amounts) => amounts.reduce((total, amount) => total + amount, 0);

const amounts = (/** @type {ReadDiscount[]} */ discounts) => discounts.map((discount) => discount.amount);

const gross = (/** @type {ReadItem} */ item) => item.price - sum(amounts(item.discounts));

/** Order-insensitive key for a multiset of values. */
const key = (/** @type {unknown[]} */ values) => JSON.stringify(values.map((value) => JSON.stringify(value)).sort());

function f1(/** @type {number[]} */ read, /** @type {number[]} */ truth) {
  if (read.length === 0 && truth.length === 0) return 1;
  const left = [...truth];
  let matched = 0;
  for (const amount of read) {
    const at = left.indexOf(amount);
    if (at === -1) continue;
    left.splice(at, 1);
    matched += 1;
  }
  return matched === 0 ? 0 : (2 * matched) / (read.length + truth.length);
}

/** Every non-tax, non-tip amount of a reply: each Item at its gross price, each discount on its own, fees and service charges. */
function chargesOf(/** @type {ScanReply} */ reply) {
  return [
    ...reply.items.flatMap((item) => [gross(item), ...amounts(item.discounts)]),
    ...reply.bundles.flatMap((bundle) => amounts(bundle.discounts)),
    ...reply.adjustments.filter(({ kind }) => kind !== "tax" && kind !== "tip").map(({ amount }) => amount),
  ];
}

/** (gross, discounts) for each truth Item with discounts printed under it, or null when the truth marks none. */
function truthSplit(/** @type {TruthLine[]} */ lines) {
  if (!lines.some((line) => line.under)) return null;
  /** @type {[number, number[]][]} */
  const pairs = [];
  for (const line of lines) {
    if (line.k === "i") pairs.push([line.cents, []]);
    else if (line.k === "d" && line.under) pairs.at(-1)?.[1].push(line.cents);
  }
  return key(pairs.filter(([, discounts]) => discounts.length > 0).map(([price, discounts]) => [price, [...discounts].sort((a, b) => a - b)]));
}

function scoreBundles(/** @type {Truth} */ truth, /** @type {ScanReply} */ reply) {
  const lines = truth.lines ?? [];
  const truthBundles = (truth.bundles ?? []).map((_, at) => lines.filter((line) => line.bundle === at));
  const members = key(truthBundles.map((bundle) => key(bundle.filter((line) => line.k === "i").map((line) => line.cents))));
  const discounts = key(truthBundles.map((bundle) => key(bundle.filter((line) => line.k === "d").map((line) => line.cents))));
  const outside = key(lines.filter((line) => line.k === "i" && line.bundle === undefined).map((line) => line.cents));
  const inBundle = new Set(reply.bundles.flatMap((bundle) => bundle.items));
  const score = {
    count: reply.bundles.length === truthBundles.length,
    members: key(reply.bundles.map((bundle) => key(bundle.items.map((at) => gross(reply.items[at]))))) === members,
    discounts: key(reply.bundles.map((bundle) => key(amounts(bundle.discounts)))) === discounts,
    outside: key(reply.items.filter((_, at) => !inBundle.has(at)).map(gross)) === outside,
  };
  return { ...score, right: Object.values(score).every(Boolean) };
}

const FAILED_BUNDLES = { count: false, members: false, discounts: false, outside: false, right: false };

/**
 * Scores one reading against its truth. A null reply is a failed reading.
 * @param {Truth} truth
 * @param {ScanReply | null} reply
 * @returns {Score}
 */
export function scoreReading(truth, reply) {
  const split = truthSplit(truth.lines ?? []);
  const hasBundles = (truth.bundles?.length ?? 0) > 0;
  if (reply === null) {
    return {
      full: false,
      itemsF1: truth.items ? 0 : null,
      split: split === null ? null : false,
      bundles: hasBundles ? FAILED_BUNDLES : null,
      taxRight: false,
      totalRight: false,
      reconciles: false,
      checkPassed: false,
    };
  }
  const itemsF1 = truth.items ? f1(chargesOf(reply), truth.items) : null;
  const splitRight =
    split === null
      ? null
      : key(
          reply.items
            .filter((item) => item.discounts.length > 0)
            .map((item) => [gross(item), amounts(item.discounts).sort((a, b) => a - b)]),
        ) === split;
  const taxRight = sum(reply.adjustments.filter(({ kind }) => kind === "tax").map(({ amount }) => amount)) === truth.tax;
  const totalRight = reply.total === truth.total;
  const reconciles =
    sum(reply.items.map((item) => item.price)) +
      sum(reply.bundles.flatMap((bundle) => amounts(bundle.discounts))) +
      sum(reply.adjustments.map(({ amount }) => amount)) ===
    reply.total;
  return {
    full: (itemsF1 ?? 1) === 1 && taxRight && totalRight && reconciles && splitRight !== false,
    itemsF1,
    split: splitRight,
    bundles: hasBundles ? scoreBundles(truth, reply) : null,
    taxRight,
    totalRight,
    reconciles,
    checkPassed: reply.check.passed,
  };
}

const median = (/** @type {number[]} */ values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const mean = (/** @type {number[]} */ values) => (values.length ? sum(values) / values.length : null);

/** "x/n" over the runs where the measure applies, or "n/a" when it applies to none. */
const fraction = (/** @type {(boolean | null)[]} */ values) => {
  const applied = values.filter((value) => value !== null);
  return applied.length ? `${applied.filter(Boolean).length}/${applied.length}` : "n/a";
};

function row(/** @type {string} */ id, /** @type {RunResult[]} */ runs) {
  const f1 = mean(runs.flatMap(({ score }) => (score.itemsF1 === null ? [] : [score.itemsF1])));
  const cost = mean(runs.flatMap(({ cost }) => (cost === null ? [] : [cost])));
  return [
    id,
    String(runs.length),
    `${runs.filter(({ score }) => score.full).length}/${runs.length}`,
    f1 === null ? "n/a" : f1.toFixed(3),
    fraction(runs.map(({ score }) => score.split)),
    fraction(runs.map(({ score }) => score.bundles?.right ?? null)),
    String(runs.filter(({ score }) => !score.full && score.checkPassed).length),
    String(runs.filter(({ passes }) => passes === 2).length),
    String(Math.round(median(runs.map(({ ms }) => ms)))),
    String(Math.round(Math.max(...runs.map(({ ms }) => ms)))),
    cost === null ? "n/a" : `$${cost.toFixed(5)}`,
    runs.flatMap(({ status }) => (status === 200 ? [] : [status ?? "network"])).join(" "),
  ];
}

/**
 * The harness table: a header, one row per fixture in first-seen order, and a totals row.
 * @param {RunResult[]} results
 * @returns {string[][]}
 */
export function tableRows(results) {
  const ids = [...new Set(results.map(({ id }) => id))];
  return [
    ["fixture", "runs", "fully correct", "items F1", "split right", "Bundles right", "wrong, check passed", "pass 2", "median ms", "worst ms", "mean cost", "failed"],
    ...ids.map((id) => row(id, results.filter((result) => result.id === id))),
    row("all", results),
  ];
}

/**
 * Whether the fraction of fully correct readings reaches the floor. No floor always passes.
 * @param {RunResult[]} results
 * @param {{ fullyCorrect: number } | null} floor
 */
export function meetsFloor(results, floor) {
  const fullyCorrect = results.length ? results.filter(({ score }) => score.full).length / results.length : 0;
  return { met: floor === null || fullyCorrect >= floor.fullyCorrect, fullyCorrect };
}
