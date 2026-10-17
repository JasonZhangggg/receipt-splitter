// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cents, price } from "../core/money";
import { applyOperation, createSplit, type Operation, type Optimistic, type ServerMessage } from "../core/operations";
import { computeShares } from "../core/shares";
import { deviceId, itemId, participantId, type Split } from "../core/split";
import { mintedId } from "../core/test-ids";
import { circleTap } from "../ui/split-view/model";
import { answerByMs } from "./connection";
import { forgetFirstSight, keepCreated } from "./first-sight";
import { useLiveSplit, type Answer } from "./client";

const sockets = vi.hoisted(() => {
  class FakeSocket {
    static all: FakeSocket[] = [];
    readonly OPEN = 1;
    readonly CONNECTING = 0;
    readyState = 0;
    frames: { ref: string; op: Operation }[] = [];
    /** What PartySocket holds while the link is not open. */
    queue: { ref: string; op: Operation }[] = [];
    reconnects = 0;
    private listeners = new Map<string, ((event: unknown) => void)[]>();
    constructor() {
      FakeSocket.all.push(this);
    }
    addEventListener(type: string, listener: (event: unknown) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    send(data: string) {
      (this.readyState === this.OPEN ? this.frames : this.queue).push(JSON.parse(data));
    }
    drainQueuedMessages() {
      this.queue = [];
    }
    open() {
      this.readyState = 1;
      this.emit("open", {});
      this.frames.push(...this.queue);
      this.queue = [];
    }
    close() {}
    reconnect() {
      this.reconnects += 1;
    }
    emit(type: string, event: unknown) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
  }
  return FakeSocket;
});
vi.mock("partysocket", () => ({ PartySocket: sockets }));

const ann = participantId("ann");
const bob = participantId("bob");
const cat = participantId("cat");
const rice = itemId("rice");
const sprite = itemId("sprite");
const room = "abcdefghjkmnpqrstuvwxy";

function dinner(): Split {
  const made = createSplit({
    id: mintedId("q7Xv0Lr9_aZ-3mKp"),
    receipt: {
      items: [
        { id: rice, name: "Rice", price: price(800) },
        { id: itemId("fries"), name: "Fries", price: price(100) },
        { id: sprite, name: "Sprite", price: price(250) },
      ],
      adjustments: [],
      subtotal: cents(1150),
      total: cents(1150),
    },
    participants: [{ id: ann, name: "Ann" }],
    paymentHandles: [],
  });
  if (!made.ok) throw new Error("fixture");
  let split = made.split;
  const ops: Operation[] = [
    { by: ann, type: "addParticipant", participant: { id: bob, name: "Bob" } },
    { by: ann, type: "addParticipant", participant: { id: cat, name: "Cat" } },
    { by: bob, type: "pick", participantId: bob, device: deviceId("bob-phone"), takeOver: false },
  ];
  for (const op of ops) split = serve(split, op);
  return split;
}

function serve(split: Split, op: Operation): Split {
  const result = applyOperation(split, op, { creator: false });
  if (!result.ok) throw new Error(`the server refused ${op.type}: ${result.rejection.reason}`);
  return result.split;
}

const claim = (who: typeof bob, item: typeof rice): Optimistic => ({ by: who, type: "claim", itemId: item, participantId: who });
const unclaim = (who: typeof bob, item: typeof rice): Optimistic => ({ by: who, type: "unclaim", itemId: item, participantId: who });

describe("useLiveSplit with actions laid over the Split", () => {
  let host: HTMLElement;
  let root: Root;
  let hook: ReturnType<typeof useLiveSplit>;

  function Probe() {
    hook = useLiveSplit(room);
    return null;
  }
  const socket = () => sockets.all.at(-1)!;
  const hear = (message: ServerMessage) => act(async () => socket().emit("message", { data: JSON.stringify(message) }));
  const state = (split: Split, ref: string | null): ServerMessage => ({ type: "state", ref, photo: false, split });
  const shown = () => {
    if (hook.live.status !== "live") throw new Error("not live");
    return Object.fromEntries(computeShares(hook.live.split).shares.map(({ participantId: who, share }) => [who, share]));
  };
  const held = () => {
    if (hook.live.status !== "live") throw new Error("not live");
    return Object.fromEntries(computeShares(hook.live.server).shares.map(({ participantId: who, share }) => [who, share]));
  };
  /** Runs `op` through `act` and returns what the caller would see. */
  function lay(op: Optimistic): { answer: Answer | null } {
    const out: { answer: Answer | null } = { answer: null };
    act(() => {
      const laid = hook.act(op);
      if (!laid.sent) throw new Error("not sent");
      void laid.answer.then((answer) => {
        out.answer = answer;
      });
    });
    return out;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    sockets.all.length = 0;
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
    await act(async () => {
      socket().readyState = 1;
      socket().emit("open", {});
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a claim shows in the Shares at once and the server's echo does not count it twice", async () => {
    const start = dinner();
    await hear(state(start, null));
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 0 });

    const first = lay(claim(bob, rice));
    expect(shown()).toEqual({ ann: 0, bob: 800, cat: 0 });
    expect(held()).toEqual({ ann: 0, bob: 0, cat: 0 });
    expect(hook.idle).toBe(false);
    expect(socket().frames.map(({ op }) => op.type)).toEqual(["claim"]);

    await hear(state(serve(start, claim(bob, rice)), socket().frames[0].ref));
    expect(shown()).toEqual({ ann: 0, bob: 800, cat: 0 });
    expect(held()).toEqual({ ann: 0, bob: 800, cat: 0 });
    expect(first.answer).toEqual({ ok: true, revision: start.revision + 1 });
    expect(hook.idle).toBe(true);
  });

  it("a fast second tap reads the shown Item and unclaims; the first echo leaves the second on top", async () => {
    const start = dinner();
    await hear(state(start, null));

    lay(claim(bob, rice));
    const itemNow = () => (hook.live.status === "live" ? hook.live.split.receipt.items.find(({ id }) => id === rice)! : (undefined as never));
    const second = circleTap(itemNow(), bob);
    expect(second.type).toBe("unclaim");
    lay(second);
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 0 });

    const [one, two] = socket().frames;
    const afterOne = serve(start, claim(bob, rice));
    await hear(state(afterOne, one.ref));
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 0 });
    expect(held()).toEqual({ ann: 0, bob: 800, cat: 0 });

    await hear(state(serve(afterOne, unclaim(bob, rice)), two.ref));
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 0 });
    expect(held()).toEqual({ ann: 0, bob: 0, cat: 0 });
  });

  it("a rejected op comes off and the later ones stay", async () => {
    const start = dinner();
    await hear(state(start, null));
    const first = lay(claim(bob, rice));
    lay(claim(cat, sprite));
    expect(shown()).toEqual({ ann: 0, bob: 800, cat: 250 });

    const [one, two] = socket().frames;
    await hear({ type: "rejected", ref: one.ref, rejection: { reason: "unknownItem" } });
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 250 });
    expect(first.answer).toEqual({ ok: false, rejection: { reason: "unknownItem" } });

    await hear(state(serve(start, claim(cat, sprite)), two.ref));
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 250 });
  });

  it("another phone's state arriving mid-flight keeps the waiting op on top of it", async () => {
    const start = dinner();
    await hear(state(start, null));
    lay(claim(bob, rice));

    const theirs = serve(start, claim(cat, rice));
    await hear(state(theirs, null));
    expect(shown()).toEqual({ ann: 0, bob: 400, cat: 400 });
    expect(held()).toEqual({ ann: 0, bob: 0, cat: 800 });

    await hear(state(serve(theirs, claim(bob, rice)), socket().frames[0].ref));
    expect(shown()).toEqual({ ann: 0, bob: 400, cat: 400 });
    expect(held()).toEqual({ ann: 0, bob: 400, cat: 400 });
  });

  it("a rate-limit refusal, which carries no ref, takes the oldest waiting op off and says why", async () => {
    const start = dinner();
    await hear(state(start, null));
    const first = lay(claim(bob, rice));
    const second = lay(claim(cat, sprite));
    expect(shown()).toEqual({ ann: 0, bob: 800, cat: 250 });

    await hear({ type: "rejected", ref: null, rejection: { reason: "rateLimited", retryAfterMs: 1000 } });
    expect(first.answer).toEqual({ ok: false, rejection: { reason: "rateLimited", retryAfterMs: 1000 } });
    expect(second.answer).toBeNull();
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 250 });

    await hear(state(serve(start, claim(cat, sprite)), socket().frames[1].ref));
    expect(second.answer).toEqual({ ok: true, revision: start.revision + 1 });
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 250 });
    expect(hook.idle).toBe(true);
  });

  it("a closed socket keeps the op shown until the join state; if the server holds it, it counts as saved", async () => {
    const start = dinner();
    await hear(state(start, null));
    const first = lay(claim(bob, rice));

    await act(async () => {
      socket().readyState = 3;
      socket().emit("close", { code: 1006 });
    });
    expect(shown()).toEqual({ ann: 0, bob: 800, cat: 0 });
    expect(first.answer).toBeNull();
    expect(hook.act(claim(cat, sprite))).toEqual({ sent: false });
    expect(shown()).toEqual({ ann: 0, bob: 800, cat: 0 });

    await hear(state(serve(start, claim(bob, rice)), null));
    expect(shown()).toEqual({ ann: 0, bob: 800, cat: 0 });
    expect(first.answer).toEqual({ ok: true, revision: null });
  });

  it("a closed socket whose join state lacks the op takes it off and fails it as disconnected", async () => {
    const start = dinner();
    await hear(state(start, null));
    const first = lay(claim(bob, rice));
    await act(async () => {
      socket().readyState = 3;
      socket().emit("close", { code: 1006 });
    });
    await hear(state(start, null));
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 0 });
    expect(first.answer).toEqual({ ok: false, rejection: { reason: "disconnected" } });
    expect(hook.idle).toBe(true);
  });

  it("with no join state at all, a closed socket's op comes off when the wait runs out", async () => {
    const start = dinner();
    await hear(state(start, null));
    const first = lay(claim(bob, rice));
    await act(async () => {
      socket().readyState = 3;
      socket().emit("close", { code: 1006 });
    });
    await act(async () => {
      vi.advanceTimersByTime(answerByMs + 1);
    });
    expect(shown()).toEqual({ ann: 0, bob: 0, cat: 0 });
    expect(first.answer).toEqual({ ok: false, rejection: { reason: "disconnected" } });
  });

  it("an answer that is late past the deadline reconnects, keeps the op shown, and settles on the join state", async () => {
    const start = dinner();
    await hear(state(start, null));
    const first = lay(claim(bob, rice));
    await act(async () => {
      vi.advanceTimersByTime(answerByMs + 1);
    });
    expect(socket().reconnects).toBe(1);
    expect(shown()).toEqual({ ann: 0, bob: 800, cat: 0 });

    await hear(state(serve(start, claim(bob, rice)), null));
    expect(shown()).toEqual({ ann: 0, bob: 800, cat: 0 });
    expect(first.answer).toEqual({ ok: true, revision: null });
  });

  it("two quick adds go out in the order tapped and the index counts the first", async () => {
    const start = dinner();
    await hear(state(start, null));
    const add = (id: string): Optimistic => ({
      by: bob,
      type: "editReceipt",
      items: [{ type: "add", item: { id: itemId(id), name: id, price: price(100) }, index: hook.live.status === "live" ? hook.live.split.receipt.items.length : 0 }],
    });
    lay(add("nachos"));
    lay(add("wings"));
    expect(hook.live.status === "live" && hook.live.split.receipt.items.map(({ id }) => id)).toEqual([rice, itemId("fries"), sprite, itemId("nachos"), itemId("wings")]);
    expect(hook.live.status === "live" && hook.live.split.receipt.total).toBe(1350);
    expect(hook.live.status === "live" && hook.live.server.receipt.total).toBe(1150);
  });
});

describe("useLiveSplit with a Split already in hand before the socket opens", () => {
  let host: HTMLElement;
  let root: Root;
  let hook: ReturnType<typeof useLiveSplit>;
  const seeded = { ...dinner(), id: room as Split["id"] };

  function Probe() {
    hook = useLiveSplit(room);
    return null;
  }
  const socket = () => sockets.all.at(-1)!;
  const total = () => (hook.live.status === "live" ? hook.live.split.receipt.total : null);
  const bobsShare = () => {
    if (hook.live.status !== "live") throw new Error("not live");
    return computeShares(hook.live.split).shares.find(({ participantId: who }) => who === bob)?.share;
  };
  const tap = (op: Optimistic) => {
    const out: { answer: Answer | null } = { answer: null };
    act(() => {
      const laid = hook.act(op);
      if (!laid.sent) throw new Error("not sent");
      void laid.answer.then((got) => {
        out.answer = got;
      });
    });
    return out;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    sockets.all.length = 0;
    keepCreated(seeded);
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    forgetFirstSight(room);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a tap before the open shows on the seeded Split, goes out when the link opens, and the echo does not count it twice", async () => {
    expect(hook.live.status).toBe("live");
    const first = tap(claim(bob, rice));
    expect(bobsShare()).toBe(800);
    expect(socket().frames).toEqual([]);

    await act(async () => socket().open());
    expect(socket().frames.map(({ op }) => op.type)).toEqual(["claim"]);
    expect(bobsShare()).toBe(800);

    await act(async () => socket().emit("message", { data: JSON.stringify({ type: "state", ref: null, photo: false, split: seeded }) }));
    expect(bobsShare()).toBe(800);
    const echo = serve(seeded, claim(bob, rice));
    await act(async () => socket().emit("message", { data: JSON.stringify({ type: "state", ref: "r0", photo: false, split: echo }) }));
    expect(bobsShare()).toBe(800);
    expect(first.answer).toEqual({ ok: true, revision: echo.revision });
    expect(hook.idle).toBe(true);
  });

  it("a socket that closes before it ever opened drops the buffered tap at once, not on the join state", async () => {
    const first = tap(claim(bob, rice));
    expect(bobsShare()).toBe(800);
    await act(async () => {
      socket().readyState = 3;
      socket().emit("close", { code: 1006 });
    });
    expect(first.answer).toEqual({ ok: false, rejection: { reason: "disconnected" } });
    expect(bobsShare()).toBe(0);
    expect(socket().queue).toEqual([]);
    expect(total()).toBe(1150);
  });
});
