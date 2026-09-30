import type { TextBox } from "../ocr/types";

export type Row = {
  readonly text: string;
  readonly left: number;
  readonly lineHeight: number;
};

type Box = {
  readonly text: string;
  readonly left: number;
  readonly right: number;
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  readonly slope: number;
};

type Placed = Box & { readonly localSlope: number };

type Cluster = { y: number; readonly boxes: Placed[] };

const PRICE_ONLY = /^[-(]?\s*\$?\s*\d{1,3}(?:,\d{3})*[.,]\s?\d{2}\s*[-)]?\s*[A-Z]{0,2}$/;
const JOIN_WITHIN = 0.5;
const SLOPE_REACH = 4;
const PAIR_WITHIN = 1;

export function groupRows(textBoxes: readonly TextBox[]): Row[] {
  const boxes = textBoxes.map(measure).filter((box) => box.text.length > 0);
  const lineHeight = median(boxes.map((box) => box.height));
  const placed = boxes.map((box) => ({ ...box, localSlope: localSlope(box, boxes, lineHeight) }));
  const xref = median(placed.map((box) => box.cx));
  const labels = cluster(
    placed.filter((box) => !PRICE_ONLY.test(box.text)),
    lineHeight,
    xref,
  );
  const prices = cluster(
    placed.filter((box) => PRICE_ONLY.test(box.text)),
    lineHeight,
    xref,
  );
  const pairs = align(labels, prices, lineHeight);
  const paired = new Set(pairs.values());
  return [
    ...labels.map((row, i) => {
      const price = pairs.get(i);
      return { y: row.y, boxes: price === undefined ? row.boxes : [...row.boxes, ...prices[price].boxes] };
    }),
    ...prices.filter((_, j) => !paired.has(j)),
  ]
    .sort((a, b) => a.y - b.y)
    .map(({ boxes: row }) => ({ text: row.map((box) => box.text).join(" "), left: wordsStart(row), lineHeight }));
}

function wordsStart(row: readonly Box[]): number {
  return (row.find((box) => /[a-z]{3}/i.test(box.text)) ?? row[0]).left;
}

function measure({ text, corners: [tl, tr, br, bl] }: TextBox): Box {
  const dx = (tr.x - tl.x + br.x - bl.x) / 2;
  const dy = (tr.y - tl.y + br.y - bl.y) / 2;
  return {
    text: text.trim(),
    left: Math.min(tl.x, bl.x),
    right: Math.max(tr.x, br.x),
    cx: (tl.x + tr.x + br.x + bl.x) / 4,
    cy: (tl.y + tr.y + br.y + bl.y) / 4,
    width: dx,
    height: (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2,
    slope: dx > 0 ? dy / dx : 0,
  };
}

function localSlope(box: Box, boxes: readonly Box[], lineHeight: number): number {
  const near = boxes.filter((other) => Math.abs(other.cy - box.cy) < SLOPE_REACH * lineHeight && other.width > other.height);
  return near.length > 0 ? median(near.map((other) => other.slope)) : box.slope;
}

function cluster(boxes: readonly Placed[], lineHeight: number, xref: number): Cluster[] {
  const rows: Cluster[] = [];
  const level = (box: Placed) => box.cy - box.localSlope * (box.cx - xref);
  for (const box of [...boxes].sort((a, b) => level(a) - level(b))) {
    const y = level(box);
    const row = rows
      .slice(-3)
      .filter((candidate) => Math.abs(y - candidate.y) < JOIN_WITHIN * lineHeight && !candidate.boxes.some((other) => overlaps(other, box)))
      .sort((a, b) => Math.abs(y - a.y) - Math.abs(y - b.y))[0];
    if (row) {
      row.boxes.push(box);
      row.y += (y - row.y) / row.boxes.length;
    } else {
      rows.push({ y, boxes: [box] });
    }
  }
  for (const row of rows) row.boxes.sort((a, b) => a.left - b.left);
  return rows;
}

function overlaps(a: Box, b: Box): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 * Math.min(a.right - a.left, b.right - b.left);
}

function align(labels: readonly Cluster[], prices: readonly Cluster[], lineHeight: number): Map<number, number> {
  type Step = { readonly count: number; readonly cost: number; readonly move: "label" | "price" | "pair" };
  const better = (a: Step, b: Step) => (a.count > b.count || (a.count === b.count && a.cost < b.cost) ? a : b);
  const table: Step[][] = labels.map(() => []);
  const at = (i: number, j: number): Step => (i < 0 || j < 0 ? { count: 0, cost: 0, move: "label" } : table[i][j]);
  labels.forEach((label, i) => {
    prices.forEach((price, j) => {
      let best = better({ ...at(i - 1, j), move: "label" }, { ...at(i, j - 1), move: "price" });
      const miss = residual(label, price, lineHeight);
      if (miss !== null) best = better({ count: at(i - 1, j - 1).count + 1, cost: at(i - 1, j - 1).cost + miss, move: "pair" }, best);
      table[i][j] = best;
    });
  });
  const pairs = new Map<number, number>();
  for (let i = labels.length - 1, j = prices.length - 1; i >= 0 && j >= 0; ) {
    const { move } = table[i][j];
    if (move === "pair") pairs.set(i--, j--);
    else if (move === "label") i--;
    else j--;
  }
  return pairs;
}

function residual(label: Cluster, price: Cluster, lineHeight: number): number | null {
  const first = price.boxes[0];
  const end = label.boxes.filter((box) => box.right < first.left + lineHeight).at(-1);
  if (!end || !label.boxes.some((box) => /[a-z]{2}|\d\s*@\s*\$?\d/i.test(box.text))) return null;
  const endY = end.cy + end.localSlope * (end.right - end.cx);
  const miss = Math.abs(first.cy - (endY + first.localSlope * (first.cx - end.right)));
  return miss <= PAIR_WITHIN * lineHeight ? miss : null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 1 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
}
