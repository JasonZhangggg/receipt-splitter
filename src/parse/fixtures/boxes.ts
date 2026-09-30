import type { TextBox } from "../../ocr/types";

const LINE = 30;

export function box(text: string, x: number, row: number): TextBox {
  const [left, top, right, bottom] = [x, row * LINE, x + 12 * text.length, row * LINE + 20];
  return {
    text,
    corners: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
  };
}

export function receiptRows(rows: readonly (readonly [label: string, amount: string])[]): TextBox[] {
  return rows.flatMap(([label, amount], row) => [box(label, 20, row), ...(amount ? [box(amount, 400, row)] : [])]);
}
