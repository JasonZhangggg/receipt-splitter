import type { Locator, Page } from "@playwright/test";

/**
 * Frame sampling for the site's animations, shared by e2e/motion.spec.ts and the verify skill's motion.mjs.
 * Node runs this file directly with type stripping, so it holds erasable types only and imports types only.
 */

/**
 * `painted` is a height read by a ResizeObserver, which reports after every rAF callback and layout, just before paint.
 * A rAF sampler runs before later rAF callbacks in the same frame, so it misses a size one of them sets and a later task undoes.
 */
/** `luma` is the mean of the red, green and blue of the element's background, 0 to 255: a color that fades shows in-between values, one that switches does not. */
export type ProbeKind = "top" | "left" | "height" | "opacity" | "scale" | "angle" | "painted" | "luma";
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
    if (kind === "luma") {
      const [red, green, blue] = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
      return (red + green + blue) / 3;
    }
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

const dinnerWithTax = { ...dinner, adjustments: [...dinner.adjustments, { id: "tax", kind: "tax", name: "Tax", amount: 300 }], total: dinner.total + 300 };

let creates = 0;

type Person = { id: string; name: string };
const table: Person[] = [{ id: "jason", name: "Jason" }, { id: "sam", name: "Sam" }, { id: "priya", name: "Priya" }];
export const fitsOneRow = table.slice(0, 2);

async function openSplit(page: Page, people = table, receipt: object = dinner) {
  creates += 1;
  const response = await page.request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.19.${(Date.now() >> 8) % 250}.${creates % 250}` },
    data: { split: { receipt, participants: people, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  if (response.status() !== 201) throw new Error(`creating a Split answered ${response.status()}`);
  if (engine(page) === "webkit") await page.addInitScript(() => Object.assign(Element.prototype, { setPointerCapture() {}, releasePointerCapture() {} }));
  await page.goto(`/s/${(await response.json()).id}`);
  await page.getByRole("heading", { name: "Which one are you?" }).waitFor({ timeout: 15_000 });
  await still(sheet(page));
}

const sheet = (page: Page) => page.getByTestId("split-sheet");
const pickJason = (page: Page) => page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true });

export async function picked(page: Page, people = table, receipt: object = dinner) {
  await openSplit(page, people, receipt);
  await tap(pickJason(page));
  await page.getByTestId("owe").waitFor();
  await sheet(page).waitFor({ state: "detached" });
  await page.waitForTimeout(300);
}

/** Sam picks his name and checks Rice, so the footer shows his share and the Pay Jason pill. */
async function payReady(page: Page) {
  await openSplit(page);
  await tap(page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Sam", exact: true }));
  await page.getByTestId("owe").waitFor();
  await sheet(page).waitFor({ state: "detached" });
  await tap(page.getByRole("button", { name: "Rice, check for Sam" }));
  await page.locator('[aria-label="Rice, check for Sam"][aria-pressed="true"]').waitFor();
  await payPill(page).waitFor();
  await page.waitForTimeout(300);
}

const paySheet = (page: Page) => page.getByTestId("breakdown");
const payPill = (page: Page) => page.getByTestId("footer").getByRole("button", { name: "Pay Jason" });

async function payOpen(page: Page) {
  await payReady(page);
  await tap(payPill(page));
  await paySheet(page).waitFor();
  await still(paySheet(page));
}

async function grab(page: Page, target = sheet(page)): Promise<Point> {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + 14 };
}

async function sheetBody(page: Page): Promise<Point> {
  const box = (await sheet(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + 90 };
}

/** Matches the live element first, then the copy of it that fades out when the sheet's content changes. */
const testId = (id: string) => `document.querySelector('[data-testid="${id}"], [data-left-testid="${id}"]')`;
const label = (name: string) => `document.querySelector('[aria-label="${name}"]')`;

const splitTop: Probe = { key: "sheet", find: testId("split-sheet"), kind: "top" };
const sheetDim: Probe = { key: "dim", find: testId("sheet-dim"), kind: "opacity" };
const payProbes: Probe[] = [{ key: "pay", find: testId("breakdown"), kind: "top" }, sheetDim];
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
  sheetDim,
  splitTop,
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
  for (const name of ["Jason, you", "Sam"]) {
    await tap(had.getByRole("button", { name, exact: true }));
    await had.locator(`[aria-label="${name}"][aria-pressed="true"]`).waitFor();
  }
  await still(page.getByTestId("item-sheet"));
}

async function peopleOpen(page: Page, people = table) {
  await picked(page, people);
  await tap(page.getByRole("button", { name: "People", exact: true }));
  await still(page.getByTestId("people-sheet"));
}

async function addingName(page: Page) {
  await peopleOpen(page, fitsOneRow);
  await tap(page.getByTestId("people-sheet").getByRole("button", { name: "Add a person" }));
  await page.waitForTimeout(500);
}

async function priceFocused(page: Page) {
  await itemOpen(page);
  await tap(page.getByTestId("item-sheet").locator('input[aria-label="Description"]'));
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
  const yourName = page.getByRole("textbox", { name: "Your name", exact: true });
  await yourName.waitFor();
  await page.waitForTimeout(800);
  await tap(yourName);
  await page.keyboard.type("Jason");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Samantha");
  await page.waitForTimeout(500);
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

const nameField = `document.querySelector('[data-testid="people-sheet"] input[aria-label="Name"]')`;
const peopleTop: Probe = { key: "people", find: testId("people-sheet"), kind: "top" };
const priceField = `document.querySelector('[data-testid="item-sheet"] input[aria-label="Description"]')`;

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
  probes: [splitTop, { key: "owe", find: testId("owe"), kind: "top" }],
};
const openTap: Scenario = {
  id: "open-tap",
  name: "Pay sheet: opens from the footer pill",
  setup: payReady,
  act: (page) => tap(payPill(page)),
  probes: payProbes,
};
const collapseTap: Scenario = {
  id: "collapse-tap",
  name: "Pay sheet: closes by tap away",
  setup: payOpen,
  act: async (page) => tapAt(page, { x: (page.viewportSize()?.width ?? 390) / 2, y: 60 }),
  probes: payProbes,
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
  setup: async (page) => {
    await itemShared(page);
    await tap(page.getByTestId("item-sheet").getByRole("button", { name: /^How to split: / }));
    await still(page.getByRole("dialog", { name: "How to split" }));
  },
  act: (page) => tap(page.getByRole("dialog", { name: "How to split" }).getByRole("button", { name: "By shares", exact: true })),
  quietMs: 1200,
  probes: [
    { key: "mode", find: testId("split-mode"), kind: "opacity" },
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
const addRowButton = (page: Page) => page.getByTestId("receipt").getByRole("button", { name: "Add item, tax, tip or discount", exact: true });
const addProbes: Probe[] = [
  { key: "add", find: testId("add-sheet"), kind: "top" },
  splitTop,
];
const addOpenScenario: Scenario = {
  id: "add-open",
  name: "Add item: the sheet opens from the Add row",
  setup: picked,
  act: (page) => tap(addRowButton(page)),
  probes: addProbes,
};

async function addFilled(page: Page) {
  await picked(page);
  await tap(addRowButton(page));
  await addSheet(page).getByRole("textbox", { name: "Name", exact: true }).fill("Tea");
  await addSheet(page).getByRole("textbox", { name: "Price", exact: true }).fill("3.00");
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
    { key: "addRow", find: label("Add item, tax, tip or discount"), kind: "top" },
  ],
};

async function taxOpen(page: Page) {
  await picked(page, table, dinnerWithTax);
  await tap(page.getByRole("button", { name: "Open Tax, $3.00" }));
  await still(page.getByTestId("adjustment-sheet"));
}

const chargeDelete: Scenario = {
  id: "charge-delete",
  name: "Delete charge: the row collapses out and the rows under it slide up",
  setup: taxOpen,
  act: (page) => tap(page.getByTestId("adjustment-sheet").getByRole("button", { name: "Delete charge" })),
  quietMs: 800,
  probes: [
    { key: "addRow", find: label("Add item, tax, tip or discount"), kind: "top" },
    { key: "total", find: testId("total"), kind: "top" },
  ],
};

const deleteItem = (page: Page) => tap(page.getByTestId("item-sheet").getByRole("button", { name: "Delete item" }));
const leaving = (id: string) => `document.querySelector('[data-testid="line-${id}"]')?.parentElement ?? null`;

const itemDelete: Scenario = {
  id: "item-delete",
  name: "Delete item: the row collapses out and the rows under it slide up",
  setup: async (page) => {
    await picked(page);
    await tap(page.getByRole("button", { name: /^Open Tostones/ }));
    await still(page.getByTestId("item-sheet"));
  },
  act: deleteItem,
  quietMs: 800,
  probes: [
    { key: "rowFade", find: leaving("tostones"), kind: "opacity" },
    { key: "bundle", find: testId("bundle-bucket"), kind: "top" },
    { key: "addRow", find: label("Add item, tax, tip or discount"), kind: "top" },
  ],
};

const bundleItemDelete: Scenario = {
  id: "bundle-item-delete",
  name: "Delete a Bundle's line: the row collapses out of the open Bundle and the rows under it slide up",
  setup: async (page) => {
    await bundleOpen(page);
    await tap(page.getByRole("button", { name: /^Open Sprite/ }));
    await still(page.getByTestId("item-sheet"));
  },
  act: deleteItem,
  quietMs: 800,
  probes: [
    { key: "rowFade", find: leaving("sprite"), kind: "opacity" },
    { key: "addRow", find: label("Add item, tax, tip or discount"), kind: "top" },
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

const themeToggle = (page: Page) => page.getByRole("button", { name: "Switch to dark mode" });
const chosenDot = `document.querySelector('[data-testid="checked"]')`;

/** Jason checks Rice, so a filled dot is on the page. A color still fading when the circle reveals the new theme would show an old-theme color (rule 18). */
async function themeReady(page: Page) {
  await picked(page);
  await tap(page.getByRole("button", { name: "Rice, check for Jason" }));
  await page.locator('[data-testid="checked"]').waitFor();
  await page.waitForTimeout(600);
}

const themeFlip: Scenario = {
  id: "theme-flip",
  name: "Theme flip: a claimed dot changes color in one step under the circle",
  instant: true,
  setup: themeReady,
  act: (page) => tap(themeToggle(page)),
  probes: [
    { key: "dot", find: chosenDot, kind: "luma" },
  ],
};

type Held = typeof window & { __mountHeld?: boolean; __release?: () => void };

/** The app mounts behind the loader, but the page is not told until the scenario lets go, so the leave is measured apart from the bundle's own long frames. */
async function loaderUp(page: Page) {
  await page.addInitScript(() => {
    const win = window as Held;
    const dispatch = EventTarget.prototype.dispatchEvent;
    let held: Event | null = null;
    win.__release = () => {
      win.__release = undefined;
      if (held) dispatch.call(document, held);
    };
    EventTarget.prototype.dispatchEvent = function (event: Event) {
      if (event.type !== "splitwith:mounted" || !win.__release) return dispatch.call(this, event);
      held = event;
      win.__mountHeld = true;
      return true;
    };
  });
  await page.goto("/", { waitUntil: "commit" });
  await page.waitForFunction(() => (window as Held).__mountHeld === true && Number(getComputedStyle(document.getElementById("rs-boot")!).opacity) > 0.99, undefined, { timeout: 7000 });
}

const loaderLeave: Scenario = {
  id: "loader-leave",
  name: "Loader: fades out as the page fades in",
  setup: loaderUp,
  act: (page) => page.evaluate(() => (window as Held).__release?.()),
  probes: [
    { key: "loader", find: `document.getElementById("rs-boot")`, kind: "opacity" },
    { key: "page", find: `document.getElementById("root")`, kind: "opacity" },
  ],
};

const sheetAndHome: Scenario[] = [
  pickHandoff,
  {
    id: "pick-flick",
    name: "Split sheet: a flick on the pick sheet closes it",
    setup: openSplit,
    act: async (page) => drag(page, await sheetBody(page), 260, 120),
    probes: [splitTop],
  },
  openTap,
  collapseTap,
  {
    id: "collapse-drag",
    name: "Pay sheet: closes by slow drag",
    setup: payOpen,
    act: async (page) => drag(page, await grab(page, paySheet(page)), 260, 500),
    probes: payProbes,
  },
  {
    id: "collapse-flick",
    name: "Pay sheet: closes by flick",
    setup: payOpen,
    act: async (page) => drag(page, await grab(page, paySheet(page)), 200, 100),
    probes: payProbes,
  },
  bundleExpand,
  bundleCollapse,
  itemOpenScenario,
  {
    id: "item-close",
    name: "Item sheet closes on a tap on the page above it",
    setup: itemOpen,
    act: (page) => tapAt(page, { x: 30, y: 16 }),
    probes: itemProbes,
  },
  {
    id: "name-add",
    name: "Home: a name is added to the sentence",
    instant: true,
    setup: homeTyping,
    act: (page) => page.keyboard.press("Enter"),
    probes: [
      { key: "names", find: `document.querySelector('[data-testid="sentence"]')`, kind: "height" },
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
    setup: withKeyboard((page) => peopleOpen(page, fitsOneRow)),
    act: (page) => tap(page.getByTestId("people-sheet").getByRole("button", { name: "Add a person" })),
    probes: [peopleTop, { key: "field", find: nameField, kind: "top" }],
  },
  {
    id: "keyboard-name-down",
    name: "Split sheet: the page pans back in one step on blur",
    instant: true,
    setup: withKeyboard(addingName),
    act: blur,
    probes: [peopleTop],
  },
  {
    id: "keyboard-price-up",
    name: "Item sheet: the page pans up in one step when the Description field takes focus",
    instant: true,
    setup: withKeyboard(itemOpen),
    act: (page) => tap(page.getByTestId("item-sheet").locator('input[aria-label="Description"]')),
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
  chargeDelete,
  itemDelete,
  bundleItemDelete,
  photoOpen,
  {
    id: "photo-close",
    name: "Photo viewer closes",
    setup: photoShown,
    act: (page) => tap(page.getByRole("button", { name: "Close photo" })),
    probes: photoProbes,
  },
  themeFlip,
  reduced(themeFlip),
  loaderLeave,
  { ...reduced(pickHandoff), probes: [{ key: "sheetFade", find: testId("split-sheet"), kind: "opacity" }] },
  reduced(openTap),
  { ...reduced(collapseTap), probes: [{ key: "sheetFade", find: testId("breakdown"), kind: "opacity" }] },
  reduced(bundleExpand),
  reduced(bundleCollapse),
  { ...reduced(itemOpenScenario), probes: [{ key: "itemFade", find: testId("item-sheet"), kind: "opacity" }] },
  reduced(splitRows),
  reduced(addRowScenario),
  reduced(chargeDelete),
  reduced(itemDelete),
  reduced(photoOpen),
  {
    id: "reduced-collapse-drag",
    name: "Reduced motion: the Pay sheet dragged down and let go leaves at once",
    reduce: true,
    instant: true,
    setup: async (page) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await payOpen(page);
    },
    act: async (page) => drag(page, await grab(page, paySheet(page)), 200, 400),
    probes: [{ key: "sheetFade", find: testId("breakdown"), kind: "opacity" }],
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

const anyWidth = new Set(["name-add", "photo-open", "photo-close", "reduced-photo-open", "loader-leave"]);

const claimPopover = `document.querySelector('[role="dialog"][aria-label="Check Rice for Sam?"]')`;
const popoverProbes: Probe[] = [
  { key: "popover", find: claimPopover, kind: "opacity" },
  { key: "popoverScale", find: claimPopover, kind: "scale" },
];
/** Rice's dot while the list is viewed as Sam. Tapping it asks before it checks Rice for him. */
const samRiceDot = (page: Page) => page.getByRole("button", { name: "Rice, check for Sam" });

async function deskSplit(page: Page) {
  creates += 1;
  const response = await page.request.post("/api/splits", {
    headers: { "cf-connecting-ip": `198.19.${(Date.now() >> 8) % 250}.${creates % 250}` },
    data: { split: { receipt: dinner, participants: table, paymentHandles: [{ service: "venmo", handle: "jason-z" }] } },
  });
  if (response.status() !== 201) throw new Error(`creating a Split answered ${response.status()}`);
  await page.goto(`/s/${(await response.json()).id}`);
  await page.getByRole("heading", { name: "Which one are you?" }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

async function deskPicked(page: Page) {
  await deskSplit(page);
  await page.getByRole("dialog", { name: "Which one are you?" }).getByRole("button", { name: "Jason", exact: true }).click();
  await page.getByTestId("split-sheet").waitFor({ state: "detached" });
  await page.waitForTimeout(600);
}

async function viewingSam(page: Page) {
  await deskPicked(page);
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("dialog", { name: "People" }).getByRole("button", { name: "Sam", exact: true }).click();
  await page.getByRole("dialog", { name: "People" }).waitFor({ state: "detached" });
  await page.waitForTimeout(600);
}

async function deskPopover(page: Page) {
  await viewingSam(page);
  await samRiceDot(page).click();
  await page.getByRole("dialog", { name: "Check Rice for Sam?" }).waitFor();
  await page.waitForTimeout(400);
}

async function deskBundleOpen(page: Page) {
  await deskPicked(page);
  await openBundle(page);
  await page.locator('[data-testid^="bundle-"]').locator('[aria-controls][aria-expanded="true"]').waitFor();
  await page.waitForTimeout(700);
}

const deskPopoverOpen: Scenario = {
  id: "desk-popover-open",
  name: "Desktop: the claim popover scales in from its dot",
  layout: "desktop",
  setup: viewingSam,
  act: (page) => samRiceDot(page).click(),
  probes: popoverProbes,
};
const deskBundleExpand: Scenario = { ...bundleExpand, id: "desk-bundle-expand", name: "Desktop: Bundle expands, chevron turns", layout: "desktop", setup: deskPicked };
const deskBundleCollapse: Scenario = { ...bundleCollapse, id: "desk-bundle-collapse", name: "Desktop: Bundle collapses, chevron turns back", layout: "desktop", setup: deskBundleOpen };

export const scenarios: Scenario[] = [
  ...sheetAndHome.map((scenario) => (anyWidth.has(scenario.id) ? scenario : { ...scenario, layout: "phone" as const })),
  deskPopoverOpen,
  {
    id: "desk-popover-close",
    name: "Desktop: a click outside fades the claim popover out",
    layout: "desktop",
    setup: deskPopover,
    act: (page) => page.mouse.click(20, 880),
    probes: popoverProbes,
  },
  {
    id: "desk-popover-key",
    name: "Desktop: Enter on a dot shows the claim popover at once",
    layout: "desktop",
    instant: true,
    setup: async (page) => {
      await viewingSam(page);
      await samRiceDot(page).focus();
    },
    act: (page) => page.keyboard.press("Enter"),
    probes: popoverProbes,
  },
  deskBundleExpand,
  deskBundleCollapse,
  { ...reduced(deskPopoverOpen), layout: "desktop" },
  { ...reduced(deskBundleExpand), layout: "desktop" },
  { ...reduced(deskBundleCollapse), layout: "desktop" },
];
