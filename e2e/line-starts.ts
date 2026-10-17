import type { Page } from "@playwright/test";

/**
 * The punctuation marks that open a line of the home sentence, one entry per such line. A line is every character, field and button whose middle
 * sits in one vertical band; the leftmost of them opens it.
 */
export function punctuationStartingALine(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Atom = { left: number; mid: number; text: string };
    const root = document.querySelector('[data-testid="sentence"]')!;
    const atoms: Atom[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest("select")) continue;
      const value = node.nodeValue ?? "";
      for (let at = 0; at < value.length; at++) {
        if (/\s|⁠/.test(value[at]!)) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        const box = range.getClientRects()[0];
        if (box && box.width > 0) atoms.push({ left: box.left, mid: box.top + box.height / 2, text: value[at]! });
      }
    }
    for (const el of root.querySelectorAll("input, button, svg")) {
      const box = el.getBoundingClientRect();
      if (box.width > 0) atoms.push({ left: box.left, mid: box.top + box.height / 2, text: "" });
    }
    atoms.sort((a, b) => a.mid - b.mid);
    const lines: Atom[][] = [];
    for (const atom of atoms) {
      const line = lines.at(-1);
      if (line && Math.abs(atom.mid - line[0]!.mid) < 10) line.push(atom);
      else lines.push([atom]);
    }
    return lines.flatMap((line) => {
      const first = line.sort((a, b) => a.left - b.left)[0]!;
      return /^[.,;:!?)]$/.test(first.text) ? [first.text] : [];
    });
  });
}

/**
 * The marks of punctuation that follow a field or button with a line break allowed between them. WebKit wraps there where Chromium does not, so a
 * line sweep in Chromium cannot see it: each such mark must share a run with `white-space: nowrap` with the field or button before it.
 */
export function punctuationFreeToWrap(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="sentence"]')!;
    const free: string[] = [];
    for (const atom of root.querySelectorAll<HTMLElement>("input, button")) {
      if (atom.closest("select")) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      walker.currentNode = atom;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (atom.contains(node)) continue;
        const mark = /^\s*([.,;:!?])/.exec(node.nodeValue ?? "")?.[1];
        if (!mark) break;
        let glued = false;
        for (let up: HTMLElement | null = node.parentElement; up && up !== root; up = up.parentElement) {
          if (getComputedStyle(up).whiteSpace === "nowrap" && up.contains(atom)) glued = true;
        }
        if (!glued) free.push(`${mark} after ${atom.getAttribute("aria-label") ?? atom.textContent}`);
        break;
      }
    }
    return free;
  });
}
