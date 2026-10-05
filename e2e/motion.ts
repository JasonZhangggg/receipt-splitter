import type { Locator, Page } from "@playwright/test";

/**
 * Frame sampling for the site's animations, shared by e2e/motion.spec.ts and the verify skill's motion.mjs.
 * Node runs this file directly with type stripping, so it holds erasable types only and imports types only.
 */

/**
 * `painted` is a height read by a ResizeObserver, which reports after every rAF callback and layout, just before paint.
 * A rAF sampler runs before later rAF callbacks in the same frame, so it misses a size one of them sets and a later task undoes.
 */
export type ProbeKind = "top" | "left" | "height" | "opacity" | "scale" | "angle" | "painted";
/** `find` is a JS expression evaluated in the page each frame; it returns the element or null. */
export type Probe = { key: string; find: string; kind: ProbeKind };
/** `t` is the frame's vsync stamp, which can precede an action the callback then sees; `at` is when the callback ran. Traces saved before `at` existed lack it. */
export type Frame = { t: number; at?: number; v: Record<string, number | null> };
export type Paint = { t: number; key: string; v: number };
export type Trace = { frames: Frame[]; painted: Paint[]; start: number; release: number; end: number; longTasks: { start: number; duration: number }[] | null };

export type Scenario = {
  name: string;
  /** Short id used to select scenarios on the command line. */
  id: string;
  reduce?: boolean;
  latencyMs?: number;
  quietMs?: number;
  /** The change is meant to land in one frame: under reduced motion, or after a keyboard action, which never animates. */
  instant?: boolean;
  /** The Split page layout the scenario drives: the phone's sheets under 1024 px, or the desktop pair and popovers. Absent, it runs at any width. */
  layout?: Layout;
  setup: (page: Page) => Promise<void>;
  act: (page: Page) => Promise<void>;
  probes: Probe[];
};

export type Layout = "phone" | "desktop";

export const vsync = 1000 / 60;

/** Set from the round 2 measurements in /tmp/v2/sheet/round2/motion.md. */
export const limits = {
  /** Longest frame gap allowed at normal CPU speed. */
  gapMs: 50,
  /** Largest move of a position in one 60 Hz frame. The 300 ms ease-drawer glides peak at 104 to 116 px. */
  jumpPx: 140,
  /** A step this many times larger than both neighbouring steps, and over spikeMinPx, is a jump even under jumpPx. */
  spikeRatio: 3,
  spikeMinPx: 24,
  /** Largest chevron turn in one 60 Hz frame. */
  jumpDeg: 45,
  /** Largest opacity change in one 60 Hz frame. A pop is 1. */
  opacityStep: 0.6,
  /** A move against the direction of travel larger than this is a reversal. */
  reversePx: 2,
  reverseOpacity: 0.04,
  detourPx: 16,
  paintedPx: 1,
};

const sampler = (probes: Probe[]) => {
  type Win = typeof window & { __motion?: { frames: Frame[]; painted: Paint[]; lastChange: number; stop: boolean; longTasks: { start: number; duration: number }[] | null } };
  const win = window as Win;
  const finders = probes.map((probe) => ({ ...probe, get: new Function(`return (${probe.find});`) as () => Element | null, watched: null as Element | null }));
  const state = { frames: [] as Frame[], painted: [] as Paint[], lastChange: performance.now(), stop: false, longTasks: null as { start: number; duration: number }[] | null };
  win.__motion = state;
  const watch = (probe: (typeof finders)[number], el: Element | null) => {
    if (!el || el === probe.watched) return;
    probe.watched = el;
    new ResizeObserver((entries) => {
      if (state.stop) return;
      for (const entry of entries) state.painted.push({ t: performance.now(), key: probe.key, v: Math.round(entry.contentRect.height * 10) / 10 });
      state.lastChange = performance.now();
    }).observe(el);
  };
  if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    const tasks: { start: number; duration: number }[] = [];
    state.longTasks = tasks;
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => tasks.push({ start: entry.startTime, duration: entry.duration }))).observe({ type: "longtask" });
  }
  const opacity = (el: Element) => {
    let value = 1;
    for (let node: Element | null = el; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
    return value;
  };
  const matrix = (el: Element) => {
    const transform = getComputedStyle(el).transform;
    return transform && transform !== "none" ? new DOMMatrixReadOnly(transform) : null;
  };
  const scale = (el: Element) => {
    let value = 1;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const m = matrix(node);
      if (m) value *= Math.hypot(m.a, m.b);
    }
    return value;
  };
  const read = (el: Element, kind: ProbeKind) => {
    // On screen, so iOS panning the visual viewport for the keyboard counts as movement.
    if (kind === "top") return el.getBoundingClientRect().top - (window.visualViewport?.offsetTop ?? 0);
    if (kind === "left") return el.getBoundingClientRect().left;
    if (kind === "height") return el.getBoundingClientRect().height;
    if (kind === "opacity") return opacity(el);
    if (kind === "scale") return scale(el);
    const m = matrix(el);
    return m ? (Math.atan2(m.b, m.a) * 180) / Math.PI : 0;
  };
  let previous: Record<string, number | null> = {};
  const tick = (t: number) => {
    if (state.stop) return;
    const v: Record<string, number | null> = {};
    for (const probe of finders) {
      let el: Element | null = null;
      try {
        el = probe.get();
      } catch {
        el = null;
      }
      if (probe.kind === "painted") {
        watch(probe, el);
        continue;
      }
      v[probe.key] = el ? Number(read(el, probe.kind).toFixed(3)) : null;
      const was = previous[probe.key];
      const now = v[probe.key];
      if (was === undefined) continue;
      if ((was === null) !== (now === null) || (was !== null && now !== null && Math.abs(was - now) > 0.004)) state.lastChange = performance.now();
    }
    previous = v;
    state.frames.push({ t, at: performance.now(), v });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** Samples the probes on every animation frame while `act` runs, until nothing has changed for `quietMs`. */
export async function record(page: Page, probes: Probe[], act: () => Promise<void>, { quietMs = 400, maxMs = 5000 }: { quietMs?: number; maxMs?: number } = {}): Promise<Trace> {
  await page.evaluate(sampler, probes);
  await page.waitForTimeout(250);
  const now = () => page.evaluate(() => performance.now());
  const start = await now();
  await act();
  const release = await now();
  for (;;) {
    const { at, last } = await page.evaluate(() => ({ at: performance.now(), last: (window as unknown as { __motion: { lastChange: number } }).__motion.lastChange }));
    if ((at - last > quietMs && at - release > quietMs) || at - release > maxMs) break;
    await page.waitForTimeout(100);
  }
  return page.evaluate(
    ({ start, release }) => {
      const state = (window as unknown as { __motion: { frames: Frame[]; painted: Paint[]; lastChange: number; stop: boolean; longTasks: { start: number; duration: number }[] | null } }).__motion;
      state.stop = true;
      const end = Math.max(state.lastChange, release) + 20;
      return { frames: state.frames, painted: state.painted, start, release, end, longTasks: state.longTasks && state.longTasks.filter((task) => task.start + task.duration > start && task.start < end) };
    },
    { start, release },
  );
}

export type Verdict = {
  frames: number;
  maxGap: number;
  p95Gap: number;
  dropped: number;
  longTasks: number | null;
  longestTask: number | null;
  /** Largest move of any position probe in one 60 Hz frame, in px. */
  jumpPx: number;
  jumpDeg: number;
  opacityStep: number;
  reversals: number;
  spikes: number;
  /** Frames where a position sits strictly between where it started and where it ended. Zero means it changed in one step. */
  inBetween: number;
  detourPx: number;
  paintedPx: number;
  moved: boolean;
  failures: string[];
};

const round = (value: number) => Math.round(value * 10) / 10;

export function judge(trace: Trace, probes: Probe[], { speed = 1, instant = false } = {}): Verdict {
  const ran = (frame: Frame) => frame.at ?? frame.t;
  const inside = trace.frames.filter((frame) => ran(frame) > trace.start && ran(frame) <= trace.end);
  const before = trace.frames.filter((frame) => ran(frame) <= trace.start).at(-1);
  // WebKit sometimes runs two rAF callbacks a millisecond apart for one frame, so those count as one.
  const window = (before ? [before, ...inside] : inside).filter((frame, i, all) => i === all.length - 1 || all[i + 1].t - frame.t > 4);
  const gaps = window.slice(1).map((frame, i) => frame.t - window[i].t);
  const sorted = [...gaps].sort((a, b) => a - b);
  const maxGap = sorted.at(-1) ?? 0;
  const p95Gap = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  const dropped = gaps.filter((gap) => gap > vsync * 1.5).length;

  let jumpPx = 0;
  let jumpDeg = 0;
  let opacityStep = 0;
  let reversals = 0;
  let spikes = 0;
  let inBetween = 0;
  let detourPx = 0;
  let paintedPx = 0;
  let moved = false;
  for (const probe of probes) {
    const value = (frame: Frame) => (probe.kind === "opacity" ? (frame.v[probe.key] ?? 0) : frame.v[probe.key]);
    const series = window.map((frame) => ({ t: frame.t, v: value(frame) })).filter((point): point is { t: number; v: number } => point.v !== null && point.v !== undefined);
    if (series.length < 2) continue;
    const first = series[0].v;
    const last = series.at(-1)!.v;
    const settled = (probe.kind === "opacity" || probe.kind === "scale" ? 0.01 : 1) < Math.abs(last - first);
    moved ||= settled;
    const afterRelease = series.filter((point) => point.t >= trace.release);
    const from = afterRelease[0]?.v ?? first;
    const direction = Math.sign(last - from);
    const tolerance = probe.kind === "opacity" || probe.kind === "scale" ? limits.reverseOpacity : limits.reversePx;
    const perFrame = series.slice(1).map((point, i) => (Math.abs(point.v - series[i].v) * vsync) / Math.max(vsync, point.t - series[i].t));
    if (probe.kind === "top" || probe.kind === "left" || probe.kind === "height") {
      // Before release a synthetic finger sets the pace, so only the motion the page drives is judged.
      spikes += perFrame.filter((step, i) => series[i + 1].t > trace.release && step > limits.spikeMinPx && step > limits.spikeRatio * Math.max(perFrame[i - 1] ?? 0, perFrame[i + 1] ?? 0)).length;
    }
    if (probe.kind === "top" || probe.kind === "left" || probe.kind === "height") {
      const travelled = afterRelease.slice(1).reduce((sum, point, i) => sum + Math.abs(point.v - afterRelease[i].v), 0);
      detourPx = Math.max(detourPx, travelled - Math.abs(last - from));
    }
    for (let i = 1; i < series.length; i += 1) {
      const step = series[i].v - series[i - 1].v;
      if (probe.kind === "top" || probe.kind === "left" || probe.kind === "height") jumpPx = Math.max(jumpPx, perFrame[i - 1]);
      else if (probe.kind === "angle") jumpDeg = Math.max(jumpDeg, perFrame[i - 1]);
      else opacityStep = Math.max(opacityStep, perFrame[i - 1]);
      if (series[i].t > trace.release && direction !== 0 && step * direction < -tolerance) reversals += 1;
    }
    if (probe.kind !== "opacity" && probe.kind !== "angle" && settled) {
      const low = Math.min(first, last);
      const high = Math.max(first, last);
      const margin = probe.kind === "scale" ? 0.005 : 1;
      inBetween += series.filter((point) => point.v > low + margin && point.v < high - margin).length;
    }
  }

  for (const probe of probes.filter(({ kind }) => kind === "painted")) {
    const sizes = (trace.painted ?? []).filter(({ key }) => key === probe.key);
    const series = [sizes.filter(({ t }) => t <= trace.start).at(-1), ...sizes.filter(({ t }) => t > trace.start && t <= trace.end)].filter((paint): paint is Paint => paint !== undefined);
    if (series.length < 2) continue;
    const direction = Math.sign(series.at(-1)!.v - series[0].v);
    moved ||= direction !== 0;
    paintedPx = Math.max(paintedPx, ...series.slice(1).map(({ v }, i) => (direction === 0 ? Math.abs(v - series[i].v) : (series[i].v - v) * direction)));
  }

  const tasks = trace.longTasks;
  const failures: string[] = [];
  if (speed === 1 && maxGap > limits.gapMs) failures.push(`frame gap ${round(maxGap)} ms > ${limits.gapMs}`);
  if (instant) {
    if (inBetween > 0) failures.push(`moved through ${inBetween} in-between frames`);
  } else {
    if (jumpPx > limits.jumpPx) failures.push(`jump ${round(jumpPx)} px/frame > ${limits.jumpPx}`);
    if (spikes > 0) failures.push(`${spikes} steps over ${limits.spikeRatio}x their neighbours`);
    if (jumpDeg > limits.jumpDeg) failures.push(`turn ${round(jumpDeg)} deg/frame > ${limits.jumpDeg}`);
    if (opacityStep > limits.opacityStep) failures.push(`opacity pop ${round(opacityStep * 100) / 100}/frame > ${limits.opacityStep}`);
  }
  if (reversals > 0) failures.push(`${reversals} reversals`);
  if (detourPx > limits.detourPx) failures.push(`went ${round(detourPx)} px out and back`);
  if (paintedPx > limits.paintedPx) failures.push(`painted a height ${round(paintedPx)} px back against its change`);
  if (!moved) failures.push("nothing changed");
  return {
    frames: inside.length,
    maxGap: round(maxGap),
    p95Gap: round(p95Gap),
    dropped,
    longTasks: tasks ? tasks.length : null,
    longestTask: tasks ? round(Math.max(0, ...tasks.map((task) => task.duration))) : null,
    jumpPx: round(jumpPx),
    jumpDeg: round(jumpDeg),
    opacityStep: Math.round(opacityStep * 100) / 100,
    reversals,
    spikes,
    inBetween,
    detourPx: round(detourPx),
    paintedPx: round(paintedPx),
    moved,
    failures,
  };
}

/* Input. Chromium phones get real touches through CDP, WebKit gets synthetic pointer events, desktop gets the mouse. */

type Point = { x: number; y: number };

const engine = (page: Page) => page.context().browser()?.browserType().name() ?? "chromium";
const touches = (page: Page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);

export async function center(target: Locator): Promise<Point> {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function tap(target: Locator) {
  if (await touches(target.page())) await target.tap();
  else await target.click();
}

export async function tapAt(page: Page, point: Point) {
  if (await touches(page)) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

/** One finger, or the mouse, moves `dy` px over `ms`. */
export async function drag(page: Page, from: Point, dy: number, ms: number) {
  const lift = await press(page, from, dy, ms, true);
  await lift();
}

type Lift = () => Promise<void>;

export const hold = (page: Page, from: Point, dy: number, ms: number) => press(page, from, dy, ms, false);

async function press(page: Page, from: Point, dy: number, ms: number, release: boolean): Promise<Lift> {
  const steps = Math.max(2, Math.round(ms / 16));
  const path = Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x, y: from.y + (dy * i) / steps }));
  if (!(await touches(page))) {
    await page.mouse.move(path[0].x, path[0].y);
    await page.mouse.down();
    for (const point of path.slice(1)) {
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(16);
    }
    return () => page.mouse.up();
  }
  if (engine(page) === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [path[0]] });
    for (const point of path.slice(1)) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
      await page.waitForTimeout(16);
    }
    return async () => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    };
  }
  await page.evaluate(async ({ points, release }) => {
    const target = document.elementFromPoint(points[0].x, points[0].y)!;
    const fire = (type: string, point: { x: number; y: number }) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: point.x, clientY: point.y }));
    fire("pointerdown", points[0]);
    for (const point of points.slice(1)) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      fire("pointermove", point);
    }
    const lift = () => fire("pointerup", points.at(-1)!);
    if (release) lift();
    else (window as unknown as { __lift: () => void }).__lift = lift;
  }, { points: path, release });
  return release ? async () => {} : () => page.evaluate(() => (window as unknown as { __lift: () => void }).__lift());
}

/** Waits until the element's top holds still for 150 ms. */
export async function still(target: Locator) {
  let last: number | undefined;
  for (let i = 0; i < 60; i += 1) {
    const top = (await target.boundingBox())?.y;
    if (top !== undefined && top === last) return;
    last = top;
    await target.page().waitForTimeout(150);
  }
  throw new Error("did not hold still");
}

/**
 * iOS 27 Safari's keyboard, as measured in the simulator. Shortly after a text field takes focus the visual viewport shrinks by `px`,
 * and iOS pans it down (`offsetTop`) far enough to reveal the field where it stood when it took focus. `innerHeight` then reads the
 * layout height minus the pan. On blur both go back. The layout viewport (`clientHeight`) keeps its size throughout.
 * A field focused with `preventScroll` is not revealed, as on iOS 27. Runs in the page, so it closes over nothing.
 */
export function iosKeyboard(px: number) {
  const viewport = window.visualViewport!;
  const layout = () => document.documentElement.clientHeight;
  const real = (proto: object, key: string) => Object.getOwnPropertyDescriptor(proto, key)!.get!;
  const height = real(VisualViewport.prototype, "height");
  const offsetTop = real(VisualViewport.prototype, "offsetTop");
  let covered = 0;
  let pan = 0;
  Object.defineProperty(viewport, "height", { configurable: true, get: () => height.call(viewport) - covered });
  Object.defineProperty(viewport, "offsetTop", { configurable: true, get: () => offsetTop.call(viewport) + pan });
  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => layout() - pan });
  const set = (keyboard: number, reveal: number) => {
    if (covered === keyboard && pan === reveal) return;
    covered = keyboard;
    pan = reveal;
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  };
  const typing = (el: EventTarget | null) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  let quiet = false;
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (options?: FocusOptions) {
    quiet = options?.preventScroll === true;
    try {
      focus.call(this, options);
    } finally {
      quiet = false;
    }
  };
  document.addEventListener("focusin", ({ target }) => {
    if (!typing(target)) return;
    const reveal = quiet ? pan : Math.min(px, Math.max(pan, Math.ceil((target as Element).getBoundingClientRect().bottom + 8 - (layout() - px))));
    setTimeout(() => set(px, reveal), 60);
  });
  document.addEventListener("focusout", () => setTimeout(() => !typing(document.activeElement) && set(0, 0), 60));
}

export async function simulateKeyboard(page: Page, px = 336) {
  await page.addInitScript(iosKeyboard, px);
}

export async function addLatency(page: Page, ms: number) {
  await page.routeWebSocket(/\/parties\//, (client) => {
    const server = client.connectToServer();
    client.onMessage((message) => setTimeout(() => server.send(message), ms / 2));
    server.onMessage((message) => setTimeout(() => client.send(message), ms / 2));
  });
}

export const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** Reads `read` in the page on every frame from now on; the returned function collects the readings. */
export async function sample<T>(page: Page, read: string) {
  await page.evaluate((read) => {
    const get = new Function(`return (${read});`) as () => unknown;
    const frames: unknown[] = [];
    Object.assign(window, { sampled: frames });
    const tick = () => {
      frames.push(get());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, read);
  return () => page.evaluate(() => (window as unknown as { sampled: T[] }).sampled.slice()) as Promise<T[]>;
}

/** Values with consecutive repeats collapsed. */
export const runs = <T>(values: T[]) => values.filter((value, i) => i === 0 || value !== values[i - 1]);

/* The Split page. */

const dinner = {
  items: [
    { id: "rice", name: "Rice", price: 800 },
    { id: "tostones", name: "Tostones", price: 100 },
    { id: "pitchers", name: "Pitchers", price: 2400, quantity: 2 },
    { id: "sprite", name: "Sprite", price: 250 },
  ],
  adjustments: [{ id: "bucket", kind: "bundleDiscount", name: "Bucket deal", amount: -200, bundle: { name: "Beer Bucket", items: ["pitchers", "sprite"] } }],
  subtotal: 3550,
  total: 3350,
};

let creates = 0;

type Person = { id: string; name: string };
const table: Person[] = [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }, { id: "priya", name: "Priya" }];
export const fitsOneRow = table.slice(0, 2);

async function openSplit(page: Page, people = table) {
  creates += 1;
  const response = await page.request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.19.${(Date.now() >> 8) % 250}.${creates % 250}` },
    data: { split: { receipt: dinner, participants: people, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  if (response.status() !== 201) throw new Error(`creating a Split answered ${response.status()}`);
  if (engine(page) === "webkit") await page.addInitScript(() => Object.assign(Element.prototype, { setPointerCapture() {}, releasePointerCapture() {} }));
  await page.goto(`/s/${(await response.json()).id}`);
  await page.getByRole("heading", { name: "Which one are you?" }).waitFor({ timeout: 15_000 });
  await still(sheet(page));
}

const sheet = (page: Page) => page.getByTestId("split-sheet");
const pickJason = (page: Page) => page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true });
const meChip = (page: Page) => page.getByRole("button", { name: "Jason, you", exact: true });

export async function picked(page: Page, people = table) {
  await openSplit(page, people);
  await tap(pickJason(page));
  await page.getByTestId("owe").waitFor();
  await still(sheet(page));
  await page.waitForTimeout(300);
}

async function expanded(page: Page) {
  await picked(page);
  await tap(page.getByTestId("owe"));
  await page.getByTestId("breakdown").waitFor();
  await still(sheet(page));
}

async function grab(page: Page): Promise<Point> {
  const box = (await sheet(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + 14 };
}

async function sheetBody(page: Page): Promise<Point> {
  const box = (await sheet(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + 90 };
}

/** Matches the live element first, then the copy of it that fades out when the sheet's content changes. */
const testId = (id: string) => `document.querySelector('[data-testid="${id}"], [data-left-testid="${id}"]')`;
const label = (name: string) => `document.querySelector('[aria-label="${name}"]')`;
const heading = (name: string) => `[...document.querySelectorAll('[role="heading"]')].find((el) => el.textContent === "${name}") ?? null`;

const splitTop: Probe = { key: "sheet", find: testId("split-sheet"), kind: "top" };
const oweFade: Probe = { key: "owe", find: testId("owe"), kind: "opacity" };
const breakdownFade: Probe = { key: "breakdown", find: testId("breakdown"), kind: "opacity" };
/** The phone's share sheet: the share amount is one element that moves into place while the list and the arrow follow the sheet. */
const shareSheet: Probe[] = [
  splitTop,
  { key: "items", find: testId("breakdown-items"), kind: "opacity" },
  { key: "amount", find: `document.querySelector('[data-testid="split-sheet"] [data-testid="owe"], [data-testid="split-sheet"] [data-testid="share"]')`, kind: "top" },
  { key: "arrow", find: testId("share-arrow"), kind: "angle" },
];
const bundleHeader = `document.querySelector('[data-testid^="bundle-"] [aria-controls]')`;
const bundleProbes: Probe[] = [
  { key: "region", find: `document.querySelector('[data-testid^="bundle-"]').lastElementChild`, kind: "height" },
  { key: "regionPainted", find: `document.querySelector('[data-testid^="bundle-"]').lastElementChild`, kind: "painted" },
  { key: "regionFade", find: `document.querySelector('[data-testid^="bundle-"]').lastElementChild.firstElementChild`, kind: "opacity" },
  { key: "chevron", find: `[...${bundleHeader}.querySelectorAll("div")].find((el) => getComputedStyle(el).transform !== "none") ?? null`, kind: "angle" },
  { key: "below", find: testId("total"), kind: "top" },
];
const itemProbes: Probe[] = [
  { key: "item", find: testId("item-sheet"), kind: "top" },
  { key: "scrim", find: `document.querySelector('[data-testid="item-sheet"]')?.previousElementSibling?.firstElementChild ?? null`, kind: "opacity" },
  splitTop,
];
const chipProbes: Probe[] = [
  { key: "chipOpacity", find: `${label("Jason, you")}?.parentElement ?? null`, kind: "opacity" },
  { key: "chipScale", find: `${label("Jason, you")}?.parentElement ?? null`, kind: "scale" },
  { key: "addOpacity", find: `${label("Add a person")}?.parentElement ?? null`, kind: "opacity" },
];

const openBundle = (page: Page) => tap(page.locator('[data-testid^="bundle-"]').locator("[aria-controls]"));
const openItem = (page: Page) => tap(page.getByRole("button", { name: /^Open Rice/ }));

async function bundleOpen(page: Page) {
  await picked(page);
  await openBundle(page);
  await page.locator('[data-testid^="bundle-"]').locator('[aria-controls][aria-expanded="true"]').waitFor();
  await page.waitForTimeout(700);
}

async function itemOpen(page: Page) {
  await picked(page);
  await openItem(page);
  await still(page.getByTestId("item-sheet"));
}

export async function itemShared(page: Page) {
  await itemOpen(page);
  const had = page.getByTestId("item-sheet").getByRole("group", { name: "Who had it" });
  for (const name of ["Jason", "Sam"]) {
    await tap(had.getByRole("button", { name, exact: true }));
    await had.locator(`[aria-label="${name}"][aria-pressed="true"]`).waitFor();
  }
  await still(page.getByTestId("item-sheet"));
}

async function addingName(page: Page) {
  await picked(page, fitsOneRow);
  await tap(sheet(page).getByRole("button", { name: "Add a person" }));
  await page.waitForTimeout(500);
}

async function priceFocused(page: Page) {
  await itemOpen(page);
  await tap(page.getByTestId("item-sheet").locator('input[aria-label="Price"]'));
  await page.waitForTimeout(500);
}

const withKeyboard =
  (setup: (page: Page) => Promise<void>) =>
  async (page: Page): Promise<void> => {
    await simulateKeyboard(page);
    await setup(page);
  };

/* Home and the photo viewer. */

async function homeTyping(page: Page) {
  await page.goto("/");
  const people = page.getByRole("group", { name: "People at the table" });
  await people.waitFor();
  await page.waitForTimeout(800);
  await tap(people.getByRole("button", { name: "Your name" }));
  await page.keyboard.type("Jason");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Samantha");
  await page.waitForTimeout(500);
}

const lifts = new WeakMap<Page, Lift>();

async function homePanelHeld(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 900) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const panel = page.locator("[data-sheet-surface]");
  await panel.waitFor();
  await page.waitForTimeout(800);
  const field = (await page.getByRole("textbox", { name: "Venmo handle" }).boundingBox())!;
  const left = (await panel.boundingBox())!.x;
  lifts.set(page, await hold(page, { x: left + 4, y: field.y + field.height / 2 }, 120, 200));
}

const photoHarness = `
  import { useState } from "react";
  import { createRoot } from "react-dom/client";
  import { View } from "react-native";
  import { SafeAreaProvider } from "react-native-safe-area-context";
  import { PhotoViewer } from "./src/ui/photo-viewer";
  const uri = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='900'><rect width='600' height='900' fill='%23ede6da'/><rect x='60' y='80' width='480' height='40' fill='%23998'/></svg>";
  function App() {
    const [open, setOpen] = useState(false);
    return (
      <SafeAreaProvider>
        <View style={{ height: "100vh", padding: 24 }}>
          <button aria-label="View receipt photo" onClick={() => setOpen(true)} style={{ width: 120, height: 48 }}>
            View
          </button>
          {open ? <PhotoViewer photo={{ uri, name: "receipt.jpg" }} onExited={() => setOpen(false)} /> : null}
        </View>
      </SafeAreaProvider>
    );
  }
  createRoot(document.getElementById("root")).render(<App />);
`;

let photoBundle: string | undefined;

async function photoPage(page: Page) {
  if (!photoBundle) {
    const { build } = await import("esbuild");
    const result = await build({
      stdin: { contents: photoHarness, loader: "tsx", resolveDir: process.cwd() },
      bundle: true,
      write: false,
      jsx: "automatic",
      alias: { "react-native": "react-native-web" },
      resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js"],
      loader: { ".js": "jsx" },
      define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
    });
    photoBundle = result.outputFiles[0].text;
  }
  await page.setContent('<!doctype html><html style="height:100%"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;height:100%"><div id="root" style="height:100%"></div></body></html>');
  await page.addScriptTag({ content: photoBundle });
  await page.getByRole("button", { name: "View receipt photo" }).waitFor();
}

async function photoShown(page: Page) {
  await photoPage(page);
  await tap(page.getByRole("button", { name: "View receipt photo" }));
  await page.getByRole("button", { name: "Close photo" }).waitFor();
  await page.waitForTimeout(600);
}

const photoProbes: Probe[] = [
  { key: "photoOpacity", find: label("Close photo"), kind: "opacity" },
  { key: "photoScale", find: label("Close photo"), kind: "scale" },
];

const segmentThumb = `document.querySelector('[data-testid="item-sheet"] [role="group"][aria-label="Split"]')?.firstElementChild ?? null`;
const nameField = `document.querySelector('[data-testid="split-sheet"] input[aria-label="Name"]')`;
const priceField = `document.querySelector('[data-testid="item-sheet"] input[aria-label="Price"]')`;

const slow = (scenario: Scenario, latencyMs: number): Scenario => ({
  ...scenario,
  id: `slow-${scenario.id}`,
  name: `${latencyMs} ms network: ${scenario.name.charAt(0).toLowerCase()}${scenario.name.slice(1)}`,
  latencyMs,
});

const reduced = (scenario: Scenario): Scenario => ({
  ...scenario,
  id: `reduced-${scenario.id}`,
  name: `Reduced motion: ${scenario.name.charAt(0).toLowerCase()}${scenario.name.slice(1)}`,
  reduce: true,
  instant: true,
  setup: async (page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await scenario.setup(page);
  },
});

const pickHandoff: Scenario = {
  id: "pick-handoff",
  name: "Split sheet: pick hands off to the bar",
  setup: openSplit,
  act: (page) => tap(pickJason(page)),
  probes: [splitTop, oweFade, { key: "question", find: heading("Which one are you?"), kind: "opacity" }],
};
const openTap: Scenario = {
  id: "open-tap",
  name: "Split sheet: breakdown opens by tap",
  setup: picked,
  act: (page) => tap(page.getByTestId("owe")),
  probes: shareSheet,
};
const collapseTap: Scenario = {
  id: "collapse-tap",
  name: "Split sheet: breakdown collapses by tap",
  setup: expanded,
  act: (page) => tap(meChip(page)),
  probes: shareSheet,
};
const bundleExpand: Scenario = {
  id: "bundle-expand",
  name: "Bundle expands, chevron turns",
  setup: picked,
  act: openBundle,
  probes: bundleProbes,
};
const bundleCollapse: Scenario = {
  id: "bundle-collapse",
  name: "Bundle collapses, chevron turns back",
  setup: bundleOpen,
  act: openBundle,
  probes: bundleProbes,
};
const splitType: Scenario = {
  id: "split-type",
  name: "Item sheet: split type changes once, through the save",
  setup: itemShared,
  act: (page) => tap(page.getByTestId("item-sheet").getByRole("button", { name: "By shares", exact: true })),
  quietMs: 1200,
  probes: [
    { key: "thumb", find: segmentThumb, kind: "left" },
    { key: "rows", find: label("More shares for Jason"), kind: "opacity" },
  ],
};
async function pitchersOpen(page: Page) {
  await bundleOpen(page);
  await tap(page.getByRole("button", { name: /^Open 2x Pitchers/ }));
  await still(page.getByTestId("item-sheet"));
}

const newRow = `document.querySelector('[data-testid="line-pitchers-2"]')?.parentElement ?? null`;
const splitRows: Scenario = {
  id: "split-rows",
  name: "Split: the new row opens below the line and the row under it slides down",
  setup: pitchersOpen,
  act: (page) => tap(page.getByTestId("item-sheet").getByRole("button", { name: "Split into 2" })),
  quietMs: 800,
  probes: [
    { key: "rowHeight", find: newRow, kind: "height" },
    { key: "rowFade", find: newRow, kind: "opacity" },
    { key: "below", find: testId("line-sprite"), kind: "top" },
  ],
};

const addSheet = (page: Page) => page.getByTestId("add-sheet");
const addProbes: Probe[] = [
  { key: "add", find: testId("add-sheet"), kind: "top" },
  { key: "scrim", find: `document.querySelector('[data-testid="add-sheet"]')?.previousElementSibling?.firstElementChild ?? null`, kind: "opacity" },
  splitTop,
];
const addOpenScenario: Scenario = {
  id: "add-open",
  name: "Add item: the sheet opens from the row under the receipt",
  setup: picked,
  act: (page) => tap(page.getByRole("button", { name: "Add item", exact: true })),
  probes: addProbes,
};

async function addFilled(page: Page) {
  await picked(page);
  await tap(page.getByRole("button", { name: "Add item", exact: true }));
  await addSheet(page).getByRole("textbox", { name: "Item name", exact: true }).fill("Tea");
  await addSheet(page).getByRole("textbox", { name: "Price", exact: true }).fill("3.00");
  await tap(addSheet(page).getByRole("group", { name: "Who had it" }).getByRole("button", { name: "Jason", exact: true }));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await still(addSheet(page));
}

const addedRow = `[...document.querySelectorAll('[data-testid^="line-"]')].find((row) => row.textContent?.includes("Tea"))?.parentElement ?? null`;
const addRowScenario: Scenario = {
  id: "add-row",
  name: "Add item: the new row opens under the receipt and Add item slides down",
  setup: addFilled,
  act: (page) => tap(addSheet(page).getByRole("button", { name: "Add item", exact: true })),
  quietMs: 800,
  probes: [
    { key: "rowHeight", find: addedRow, kind: "height" },
    { key: "rowFade", find: addedRow, kind: "opacity" },
    { key: "addRow", find: label("Add item"), kind: "top" },
  ],
};

const itemOpenScenario: Scenario = {
  id: "item-open",
  name: "Item sheet opens",
  setup: picked,
  act: openItem,
  probes: itemProbes,
};
const photoOpen: Scenario = {
  id: "photo-open",
  name: "Photo viewer opens",
  setup: photoPage,
  act: (page) => tap(page.getByRole("button", { name: "View receipt photo" })),
  probes: photoProbes,
};

const sheetAndHome: Scenario[] = [
  pickHandoff,
  {
    id: "chip-entrance",
    name: "Split page: chips enter after the pick",
    setup: openSplit,
    act: (page) => tap(pickJason(page)),
    probes: chipProbes,
  },
  {
    id: "pick-flick",
    name: "Split sheet: a flick on the pick sheet closes it",
    setup: openSplit,
    act: async (page) => drag(page, await sheetBody(page), 260, 120),
    probes: [splitTop, { key: "question", find: heading("Which one are you?"), kind: "opacity" }],
  },
  openTap,
  collapseTap,
  {
    id: "open-swipe",
    name: "Split sheet: breakdown opens by swipe up",
    setup: picked,
    act: async (page) => drag(page, await grab(page), -200, 150),
    probes: shareSheet,
  },
  {
    id: "collapse-drag",
    name: "Split sheet: breakdown collapses by slow drag",
    setup: expanded,
    act: async (page) => drag(page, await grab(page), 260, 500),
    probes: shareSheet,
  },
  {
    id: "collapse-flick",
    name: "Split sheet: breakdown collapses by flick",
    setup: expanded,
    act: async (page) => drag(page, await sheetBody(page), 200, 100),
    probes: shareSheet,
  },
  bundleExpand,
  bundleCollapse,
  itemOpenScenario,
  {
    id: "item-close",
    name: "Item sheet closes on the scrim",
    setup: itemOpen,
    act: (page) => tapAt(page, { x: 30, y: 16 }),
    probes: itemProbes,
  },
  {
    id: "home-panel-spring",
    name: "Home: the panel springs back after a drag from the payment row",
    setup: homePanelHeld,
    act: (page) => lifts.get(page)!(),
    probes: [
      { key: "surface", find: "document.querySelector('[data-sheet-surface]')", kind: "top" },
      { key: "action", find: `[...document.querySelectorAll("[role='button']")].find((el) => el.textContent === "Create split link") ?? null`, kind: "top" },
    ],
  },
  {
    id: "name-add",
    name: "Home: a name chip is added",
    instant: true,
    setup: homeTyping,
    act: (page) => page.keyboard.press("Enter"),
    probes: [
      { key: "surface", find: "document.querySelector('[data-sheet-surface]')", kind: "top" },
      { key: "names", find: label("People at the table"), kind: "height" },
      { key: "chip", find: label("Remove Samantha"), kind: "top" },
      { key: "chipFade", find: label("Remove Samantha"), kind: "opacity" },
      { key: "field", find: `document.querySelector('input[aria-label="Name"]')`, kind: "top" },
      { key: "fieldLeft", find: `document.querySelector('input[aria-label="Name"]')`, kind: "left" },
    ],
  },
  splitType,
  slow(splitType, 300),
  {
    id: "keyboard-name-up",
    name: "Split sheet: the page pans up in one step when the name field takes focus",
    instant: true,
    setup: withKeyboard((page) => picked(page, fitsOneRow)),
    act: (page) => tap(sheet(page).getByRole("button", { name: "Add a person" })),
    probes: [splitTop, { key: "field", find: nameField, kind: "top" }],
  },
  {
    id: "keyboard-name-down",
    name: "Split sheet: the page pans back in one step on blur",
    instant: true,
    setup: withKeyboard(addingName),
    act: blur,
    probes: [splitTop],
  },
  {
    id: "keyboard-price-up",
    name: "Item sheet: the page pans up in one step when the price field takes focus",
    instant: true,
    setup: withKeyboard(itemOpen),
    act: (page) => tap(page.getByTestId("item-sheet").locator('input[aria-label="Price"]')),
    probes: [{ key: "item", find: testId("item-sheet"), kind: "top" }, { key: "field", find: priceField, kind: "top" }, splitTop],
  },
  {
    id: "keyboard-price-down",
    name: "Item sheet: the page pans back in one step on blur, and the bar behind it stays down",
    instant: true,
    setup: withKeyboard(priceFocused),
    act: blur,
    probes: [{ key: "item", find: testId("item-sheet"), kind: "top" }, splitTop],
  },
  splitRows,
  addOpenScenario,
  addRowScenario,
  photoOpen,
  {
    id: "photo-close",
    name: "Photo viewer closes",
    setup: photoShown,
    act: (page) => tap(page.getByRole("button", { name: "Close photo" })),
    probes: photoProbes,
  },
  reduced(pickHandoff),
  reduced(openTap),
  reduced(collapseTap),
  reduced(bundleExpand),
  reduced(bundleCollapse),
  reduced(itemOpenScenario),
  reduced(splitRows),
  reduced(addRowScenario),
  reduced(photoOpen),
  {
    id: "reduced-collapse-drag",
    name: "Reduced motion: a sheet dragged down and let go stays opaque while its content cross-fades",
    reduce: true,
    setup: async (page) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expanded(page);
    },
    act: async (page) => drag(page, await grab(page), 120, 400),
    probes: [{ key: "sheetFade", find: testId("split-sheet"), kind: "opacity" }, { key: "items", find: testId("breakdown-items"), kind: "opacity" }],
  },
];

/** Resolves once the page has painted `count` more frames, so a check that nothing changed waits on rendering and not on wall-clock time. */
export const frames = (page: Page, count: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
        step(n);
      }),
    count,
  );

export const animationsDone = (page: Page) => page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));

const anyWidth = new Set(["home-panel-spring", "name-add", "photo-open", "photo-close", "reduced-photo-open"]);

const pane = (page: Page) => page.getByRole("complementary");
const itemPopover = `document.querySelector('[role="dialog"][aria-label="Item"]')`;
const popoverProbes: Probe[] = [
  { key: "popover", find: itemPopover, kind: "opacity" },
  { key: "popoverScale", find: itemPopover, kind: "scale" },
];
// Both breakdowns carry the same test id during the swap, so each is found by its total's label.
const breakdownSaying = (words: string) =>
  `[...document.querySelectorAll('[data-testid="breakdown"], [data-left-testid="breakdown"]')].find((el) => el.textContent.includes("${words}")) ?? null`;
const riceLine = (page: Page) => page.getByRole("button", { name: /^Open Rice/ });

async function deskSplit(page: Page) {
  creates += 1;
  const response = await page.request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.19.${(Date.now() >> 8) % 250}.${creates % 250}` },
    data: { split: { receipt: dinner, participants: table, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  if (response.status() !== 201) throw new Error(`creating a Split answered ${response.status()}`);
  await page.goto(`/s/${(await response.json()).id}`);
  await pane(page).getByRole("heading", { name: "Which one are you?" }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

async function deskPicked(page: Page) {
  await deskSplit(page);
  await pane(page).getByRole("button", { name: "Jason", exact: true }).click();
  await pane(page).getByTestId("breakdown").waitFor();
  await page.waitForTimeout(600);
}

async function deskPopover(page: Page) {
  await deskPicked(page);
  await riceLine(page).click();
  await page.getByRole("dialog", { name: "Item" }).waitFor();
  await page.waitForTimeout(400);
}

async function deskBundleOpen(page: Page) {
  await deskPicked(page);
  await openBundle(page);
  await page.locator('[data-testid^="bundle-"]').locator('[aria-controls][aria-expanded="true"]').waitFor();
  await page.waitForTimeout(700);
}

const deskHandoff: Scenario = {
  id: "desk-pane-handoff",
  name: "Desktop pane: the pick content fades through to Your share",
  layout: "desktop",
  setup: deskSplit,
  act: (page) => pane(page).getByRole("button", { name: "Jason", exact: true }).click(),
  probes: [{ key: "question", find: heading("Which one are you?"), kind: "opacity" }, breakdownFade],
};
const deskPopoverOpen: Scenario = {
  id: "desk-popover-open",
  name: "Desktop: a line's popover scales in from its corner",
  layout: "desktop",
  setup: deskPicked,
  act: (page) => riceLine(page).click(),
  probes: popoverProbes,
};
const deskBundleExpand: Scenario = { ...bundleExpand, id: "desk-bundle-expand", name: "Desktop: Bundle expands, chevron turns", layout: "desktop", setup: deskPicked };
const deskBundleCollapse: Scenario = { ...bundleCollapse, id: "desk-bundle-collapse", name: "Desktop: Bundle collapses, chevron turns back", layout: "desktop", setup: deskBundleOpen };

export const scenarios: Scenario[] = [
  ...sheetAndHome.map((scenario) => (anyWidth.has(scenario.id) ? scenario : { ...scenario, layout: "phone" as const })),
  deskHandoff,
  deskPopoverOpen,
  {
    id: "desk-popover-close",
    name: "Desktop: a click outside fades the popover out",
    layout: "desktop",
    setup: deskPopover,
    act: (page) => page.mouse.click(20, 880),
    probes: popoverProbes,
  },
  {
    id: "desk-popover-key",
    name: "Desktop: Enter on a line shows its popover at once",
    layout: "desktop",
    instant: true,
    setup: async (page) => {
      await deskPicked(page);
      await riceLine(page).focus();
    },
    act: (page) => page.keyboard.press("Enter"),
    probes: popoverProbes,
  },
  {
    id: "desk-chip-swap",
    name: "Desktop pane: another person's chip fades their breakdown through",
    layout: "desktop",
    setup: deskPicked,
    act: (page) => pane(page).getByRole("button", { name: "Sam", exact: true }).click(),
    probes: [
      { key: "mine", find: breakdownSaying("Your share"), kind: "opacity" },
      { key: "theirs", find: breakdownSaying("Sam owes"), kind: "opacity" },
    ],
  },
  deskBundleExpand,
  deskBundleCollapse,
  { ...reduced(deskHandoff), layout: "desktop" },
  { ...reduced(deskPopoverOpen), layout: "desktop" },
  { ...reduced(deskBundleExpand), layout: "desktop" },
  { ...reduced(deskBundleCollapse), layout: "desktop" },
];
