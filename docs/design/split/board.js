// Throwaway mockup board, round 8. Every frame is render(state) over one Split model.
const ICONS = {
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  share: '<path d="M12 4v11M8 8l4-4 4 4"/><path d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6.5A1.5 1.5 0 0 0 14.5 5h-8A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v3.7h3.7"/><path d="M12 8.5V12l2.5 1.8"/>',
};
const icon = (n, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const money = (c) => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toFixed(2);
const plain = (c) => (c / 100).toFixed(2);

const MERCHANT = "Sukhothai Sushi + Asian Fusion";
const SHORT = "Sukhothai Sushi";
const LINK = "receiptsplitter.app/s/k7Qm2x";
const PRINTED_SUBTOTAL = 2298;
const ADJ = [
  { name: "Tax", cents: 161 },
  { name: "Service fee", cents: 345 },
  { name: "Tip", cents: 460 },
];
const NAMES = ["Jason", "Sam", "Priya", "Lee"];

// by maps a person to a weight (even, shares) or to cents (amounts). An empty map is unclaimed.
const baseItems = () => [
  { name: "Chicken Fried Rice And Egg", cents: 799, qty: 1, mode: "even", by: { Jason: 1 } },
  { name: "California Tropic And Miso", cents: 799, qty: 1, mode: "even", by: { Sam: 1 } },
  { name: "Add Two Tostones", cents: 100, qty: 1, mode: "even", by: { Jason: 1, Sam: 1 } },
  { name: "Sprite", cents: 250, qty: 1, mode: "even", by: { Priya: 1 } },
  { name: "Perrier Sparkling Water", cents: 350, qty: 1, mode: "even", by: {} },
];

// Largest-remainder rounding, so the parts of an Item always add up to its price.
function parts(it) {
  const who = Object.keys(it.by);
  if (!who.length) return {};
  if (it.mode === "amounts") return { ...it.by };
  const sum = who.reduce((a, p) => a + it.by[p], 0);
  const raw = who.map((p) => ({ p, v: (it.cents * it.by[p]) / sum }));
  const out = Object.fromEntries(raw.map((r) => [r.p, Math.floor(r.v)]));
  let left = it.cents - Object.values(out).reduce((a, b) => a + b, 0);
  for (const r of [...raw].sort((a, b) => (b.v % 1) - (a.v % 1))) { if (left-- <= 0) break; out[r.p] += 1; }
  return out;
}
const itemsSum = (items) => items.reduce((a, it) => a + it.cents, 0);
const total = () => PRINTED_SUBTOTAL + ADJ.reduce((a, x) => a + x.cents, 0);
function share(items, who) {
  const lines = items.filter((it) => who in it.by).map((it) => ({ ...it, part: parts(it)[who], n: Object.keys(it.by).length }));
  const mine = lines.reduce((a, l) => a + l.part, 0);
  const sub = itemsSum(items);
  const adj = ADJ.map((a) => ({ name: a.name, part: Math.round((a.cents * mine) / sub) }));
  return { lines, adj, total: mine + adj.reduce((a, x) => a + x.part, 0) };
}
const claimedAny = (items) => items.some((it) => Object.keys(it.by).length);
// Nobody pays for an unclaimed Item, so this is the Total minus everyone's share.
const unclaimed = (items) => total() - NAMES.reduce((a, n) => a + share(items, n).total, 0);

const fracLabel = (it) => {
  const who = Object.keys(it.by);
  if (who.length < 2) return "";
  if (it.mode === "even") return ({ 2: "½", 3: "⅓", 4: "¼" })[who.length];
  return it.mode === "shares" ? who.map((p) => it.by[p]).join(":") : "split";
};

function header(st) {
  return `<header><span class="wordmark">Receipt Splitter</span><span class="hbtns"><button class="hbtn press" aria-label="History">${icon("history")}</button><button class="hbtn press" aria-label="Share link">${icon("share")}</button></span></header>`;
}

function dots(it, sel) {
  const who = Object.keys(it.by);
  if (!who.length) return `<span class="dots"><span class="dot none"></span></span>`;
  const ordered = [...who].sort((a, b) => (a === sel ? 1 : 0) - (b === sel ? 1 : 0));
  return `<span class="dots">${ordered.map((p) => `<span class="dot${p === sel ? " me" : ""}">${p[0]}</span>`).join("")}</span>`;
}
function receipt(st) {
  const started = claimedAny(st.items);
  const rows = st.items.map((it, i) => {
    const open = started && !Object.keys(it.by).length;
    const cls = ["it", open ? "open" : "", st.pressed === i ? "pressed" : ""].join(" ");
    const frac = fracLabel(it) ? `<em>${fracLabel(it)}</em>` : "";
    const claimLabel = st.selected ? `Claim ${it.name} for ${st.selected}` : `Who had ${it.name}`;
    return `<div class="${cls}"><button class="claim" aria-label="${claimLabel}">${dots(it, st.selected)}</button><span class="nm">${it.name}${frac}</span><span class="pr">${plain(it.cents)}</span></div>`;
  }).join("");
  const gap = itemsSum(st.items) - PRINTED_SUBTOTAL;
  const why = gap ? `<p class="why"><span class="mark">Items are ${money(Math.abs(gap))} ${gap > 0 ? "over" : "short"}.</span></p>` : "";
  const adj = ADJ.map((a) => `<div class="a"><span>${a.name}</span><b>${money(a.cents)}</b></div>`).join("");
  const hint = st.selected ? `<p class="hint">${st.selected === st.you ? "Check what you had" : `Check what ${st.selected} had`}</p>` : "";
  const un = started ? `<div class="unclaimed"><span>Unclaimed</span><b class="mark">${money(unclaimed(st.items))}</b></div>` : "";
  return `<div class="doc"><div class="slip"><div class="rc-head"><h2>${MERCHANT}</h2></div>${hint}<div class="rc-items">${rows}</div>${why}
    <div class="rc-adj"><div class="a"><span>Subtotal</span><b>${money(PRINTED_SUBTOTAL)}</b></div>${adj}</div>
    <div class="rc-total"><span>Total</span><b>${money(total())}</b></div>${un}</div></div>`;
}

function chips(st) {
  const people = st.people.map((p) => {
    const cls = ["chip", p.name === st.selected ? "sel" : "", !p.picked && p.name !== st.selected ? "away" : ""].join(" ");
    return `<button class="${cls} press">${p.name}${p.name === st.you ? "<small>you</small>" : ""}</button>`;
  }).join("");
  return `<div class="names" role="group" aria-label="People">${people}<button class="chip add press" aria-label="Add a person">${icon("plus")}</button></div>`;
}

function pickList(st) {
  const rows = st.people.map((p) => {
    if (p.name === st.chosen) return `<button class="p chosen"><span class="l"><span class="dot">${p.name[0]}</span>${p.name}</span>${icon("check")}</button>`;
    if (p.name === st.reclaim) return `<div class="claimback"><div class="top"><span class="l"><span class="dot">${p.name[0]}</span>${p.name}</span></div>
      <p>Picked on another phone.</p><div class="two"><button class="action press">That's me</button><button class="ghost press">Cancel</button></div></div>`;
    if (p.picked) return `<button class="p taken" aria-label="${p.name}, picked on another phone"><span class="l"><span class="dot">${p.name[0]}</span>${p.name}</span><small>Picked</small></button>`;
    return `<button class="p press"><span class="l"><span class="dot">${p.name[0]}</span>${p.name}</span></button>`;
  }).join("");
  return `<div class="who">${rows}</div>`;
}
const notHere = () => `<button class="notyet press"><span class="ring">${icon("plus")}</span>Not here? <span>Add yourself</span></button>`;
const closeBtn = (label = "Close") => `<button class="close press" aria-label="${label}">${icon("x")}</button>`;

function pickSheet(st) {
  const line = st.creator
    ? `<p class="invite"><b>Link ready.</b> ${SHORT} · ${money(total())}</p>`
    : `<p class="invite"><b>Jason</b> invited you to split <b>${SHORT}</b> · ${money(total())}</p>`;
  let tail = notHere();
  if (st.adding) tail = `<div class="field focus"><input aria-label="Your name" value="${st.adding}" /><span class="caret"></span></div><button class="action press">Join as ${st.adding}</button>`;
  const style = `top:${st.top}px${st.adding ? ";bottom:291px;border-radius:28px" : ""}`;
  return `<div class="sheet" style="${style}"><div class="grab" aria-hidden="true"></div>
    <div class="sheet-in"><div class="topline">${line}${closeBtn("Close, just look")}</div><h2 class="ask">Which one are you?</h2>${pickList(st)}${tail}</div></div>`;
}

function regularSheet(st) {
  let body;
  if (st.creatorFresh) {
    body = `<p class="linkline"><b>Link ready</b>&ensp;${LINK}</p><div class="two"><button class="action press">${icon("share")}Share</button><button class="ghost press">${icon("copy")}Copy</button></div>`;
  } else if (!st.you) {
    body = `<p class="prompt">Pick your name to check off what you had.</p><button class="action press">Which one are you?</button>`;
  } else {
    body = `<button class="owe press"><span>You owe</span><b>${money(share(st.items, st.you).total)}${icon("chevron")}</b></button>`;
  }
  return `<div class="sheet"><div class="grab" aria-hidden="true"></div><div class="sheet-in">${chips(st)}${body}</div></div>`;
}

function breakdownSheet(st) {
  const who = st.selected;
  const p = st.people.find((x) => x.name === who);
  const s = share(st.items, who);
  const mine = who === st.you;
  const lines = s.lines.map((l) => `<div class="it"><span class="nm">${l.name}${l.n > 1 && l.mode === "even" ? `<em>${fracLabel(l)} of ${plain(l.cents)}</em>` : ""}</span><span class="pr">${plain(l.part)}</span></div>`).join("");
  const adj = s.adj.map((a) => `<div class="a"><span>${a.name}</span><b>${money(a.part)}</b></div>`).join("");
  const status = mine ? "" : p.paid ? `<span class="status paid">${icon("check")}Paid</span>` : `<span class="status">${icon("clock")}Not paid</span>`;
  const label = mine ? "You owe" : p.paid ? `${who} paid` : `${who} owes`;
  const foot = mine ? `<button class="action press"><span class="g">V</span>Pay Jason ${money(s.total)} on Venmo</button><button class="textbtn press">I already paid</button>` : "";
  return `<div class="sheet"><div class="grab" aria-hidden="true"></div><div class="sheet-in">${chips(st)}
    <div class="bd"><div class="bd-head"><span>${s.lines.length} ${s.lines.length === 1 ? "item" : "items"}</span>${status}</div><div class="rc-items">${lines}</div>
    <div class="rc-adj">${adj}</div><div class="rc-total"><span>${label}</span><b>${money(s.total)}</b></div></div>${foot}</div></div>`;
}

function detailSheet(st) {
  const it = st.items[st.detail];
  const ps = parts(it);
  const who = Object.keys(it.by);
  const people = st.people.map((p) => `<button class="chip${p.name in it.by ? " sel" : ""} press" aria-pressed="${p.name in it.by}">${p.name}</button>`).join("");
  const seg = ["even", "shares", "amounts"].map((m) => `<button class="${it.mode === m ? "on" : ""}">${{ even: "Evenly", shares: "By shares", amounts: "By amount" }[m]}</button>`).join("");
  const rows = who.map((p) => {
    const d = `<span class="who2"><span class="dot${p === st.you ? " me" : ""}">${p[0]}</span>${p}</span>`;
    if (it.mode === "even") return `<div class="sr">${d}<span class="muted">${fracLabel(it)}</span><span class="amt">${money(ps[p])}</span></div>`;
    if (it.mode === "shares") return `<div class="sr">${d}<span class="stepper sm"><button aria-label="Fewer shares">${icon("minus")}</button><b>${it.by[p]}</b><button aria-label="More shares">${icon("plus")}</button></span><span class="amt">${money(ps[p])}</span></div>`;
    return `<div class="sr">${d}<span></span><span class="amt f">$<input value="${plain(ps[p])}" inputmode="decimal" style="width:44px;text-align:right;font-weight:500" aria-label="${p}'s amount" /></span></div>`;
  }).join("");
  const assigned = Object.values(ps).reduce((a, b) => a + b, 0);
  const sum = it.mode === "amounts"
    ? `<div class="sumline"><span>${money(assigned)} of ${money(it.cents)}</span><b>${assigned === it.cents ? `${icon("check")}Adds up` : `${money(it.cents - assigned)} left`}</b></div>`
    : it.mode === "shares" ? `<div class="sumline"><span>${who.map((p) => it.by[p]).reduce((a, b) => a + b, 0)} shares</span></div>` : "";
  return `<div class="scrim"></div><div class="sheet" style="top:${st.top}px"><div class="grab" aria-hidden="true"></div><div class="sheet-in">
    <div class="topline"><h2 class="detail-title">Item</h2>${`<button class="close fill press" aria-label="Done">${icon("x")}</button>`}</div>
    <div class="field"><input value="${it.name}" aria-label="Item name" /></div>
    <div class="prow"><label class="pfield"><span class="lab">Price</span>$<input value="${plain(it.cents)}" inputmode="decimal" aria-label="Price" /></label>
      <span class="stepper"><span class="lab">Qty</span><button aria-label="Less" aria-disabled="true">${icon("minus")}</button><b>${it.qty}</b><button aria-label="More">${icon("plus")}</button></span></div>
    <p class="lbl">Who had it</p><div class="names">${people}<button class="chip add press" aria-label="Add a person">${icon("plus")}</button></div>
    <p class="lbl">Split</p><div class="seg" role="tablist">${seg}</div><div class="splits">${rows}</div>${sum}</div></div>`;
}

function historySheet(st) {
  const rows = st.history.map((h) => `<div class="h${h.undone ? " undone" : ""}"><span class="dot">${h.who[0]}</span><div><div class="what">${h.what}</div><div class="meta">${h.who} · ${h.when}</div></div>${h.undone ? `<span class="tag">Reverted</span>` : h.revert === false ? "" : `<button class="ghost sm press">Revert</button>`}</div>`).join("");
  return `<div class="scrim"></div><div class="sheet" style="top:${st.top}px"><div class="grab" aria-hidden="true"></div><div class="sheet-in">
    <div class="topline"><h2 class="detail-title">History</h2><button class="close fill press" aria-label="Close">${icon("x")}</button></div><div class="hist">${rows}</div></div></div>`;
}

function home(st) {
  const rows = st.items.map((it) => `<div class="homeit"><span>${it.name}</span><span>${plain(it.cents)}</span></div>`).join("");
  const adj = ADJ.map((a) => `<div class="a"><span>${a.name}</span><b>${money(a.cents)}</b></div>`).join("");
  const file = `<div class="file"><span class="ft" role="img" aria-label="Receipt photo"></span><div class="meta"><b>IMG_4127.jpg</b><span>5 items</span></div><button class="btn press" aria-label="Replace receipt">${icon("camera")}</button></div>`;
  const slip = `<div class="slip"><div class="rc-head"><h2>${MERCHANT}</h2></div><div class="rc-items">${rows}</div><div class="rc-adj"><div class="a"><span>Subtotal</span><b>${money(PRINTED_SUBTOTAL)}</b></div>${adj}</div><div class="rc-total"><span>Total</span><b>${money(total())}</b></div></div>`;
  const pay = `<div class="payrow"><div class="pay"><span class="picker"><span class="g">V</span><span>Venmo</span>${icon("chevron", "chev")}</span><span class="h">@jason-z</span></div><button class="more press" aria-label="Add another payment app">${icon("plus")}</button></div>`;
  const names = `<div class="names wrap">${NAMES.map((n) => `<span class="chip">${n}</span>`).join("")}<button class="chip addt press">${icon("plus")}Add</button></div>`;
  return `<header><span class="wordmark">Receipt Splitter</span></header><div class="doc">${file}${slip}</div>
    <div class="sheet"><div class="grab"></div><div class="sheet-in">${pay}${names}<button class="action press" style="margin-top:4px">Create split link</button></div></div>`;
}

const keyboard = () => {
  const row = (s) => `<div class="r">${[...s].map((c) => `<span class="k">${c}</span>`).join("")}</div>`;
  return `<div class="kb" aria-hidden="true">${row("qwertyuiop")}${row("asdfghjkl")}<div class="r"><span class="k w">⇧</span>${[..."zxcvbnm"].map((c) => `<span class="k">${c}</span>`).join("")}<span class="k w">⌫</span></div><div class="r"><span class="k w">123</span><span class="k sp">space</span><span class="k go">join</span></div><div class="bar"></div></div>`;
};

function render(st) {
  if (st.view === "home") return home(st);
  let out = header(st) + receipt(st);
  if (st.sheet === "pick") out += `<div class="scrim"></div>` + pickSheet(st);
  if (st.sheet === "add") out += `<div class="scrim"></div>` + pickSheet(st) + keyboard();
  if (st.sheet === "mid") out += `<div class="scrim" style="opacity:.45"></div><div class="sheet mid" style="top:${st.top}px"><div class="grab"></div><div class="sheet-in">${chips(st)}${pickList(st)}</div></div>`;
  if (st.sheet === "regular") out += regularSheet(st);
  if (st.sheet === "breakdown") out += breakdownSheet(st);
  if (st.sheet === "detail") out += detailSheet(st);
  if (st.sheet === "history") out += historySheet(st);
  return out;
}

const people = (picked, paid = []) => NAMES.map((name) => ({ name, picked: picked.includes(name), paid: paid.includes(name) }));
const items = baseItems();
const noClaims = items.map((it) => ({ ...it, by: {} }));
const withItem = (i, patch) => items.map((it, j) => (j === i ? { ...it, ...patch } : it));
const everyone = people(["Jason", "Sam", "Priya"], ["Priya"]);
const HISTORY = [
  { who: "Sam", what: "Sprite <s>2.50 →</s> 2.75", when: "Just now" },
  { who: "Jason", what: "Tostones split <s>evenly →</s> 2:1", when: "2 min ago", undone: true },
  { who: "Priya", what: "Checked Sprite", when: "4 min ago" },
  { who: "Sam", what: "Took Sam on a new phone", when: "6 min ago" },
  { who: "Sam", what: "Checked California Tropic", when: "7 min ago" },
  { who: "Jason", what: "Created the split", when: "8:31 PM", revert: false },
];

const FRAMES = {
  A: { theme: "light", view: "home", items },
  B: { theme: "light", view: "split", sheet: "pick", creator: true, items: noClaims, people: people([]), top: 170 },
  C: { theme: "light", view: "split", sheet: "pick", items: noClaims, people: people(["Jason"]), top: 170 },
  C2: { theme: "light", view: "split", sheet: "pick", items: noClaims, people: people(["Jason", "Sam"]), reclaim: "Sam", top: 120 },
  D: { theme: "light", view: "split", sheet: "add", items: noClaims, people: people(["Jason"]), top: 38, adding: "Maya" },
  E1: { theme: "light", view: "split", sheet: "mid", items: noClaims, people: people(["Jason"]), chosen: "Jason", you: "Jason", selected: "Jason", top: 400 },
  E2: { theme: "light", view: "split", sheet: "regular", creatorFresh: true, items: noClaims, people: people(["Jason"]), you: "Jason", selected: "Jason" },
  K: { theme: "light", view: "split", sheet: "regular", items, people: everyone },
  F: { theme: "light", view: "split", sheet: "regular", items, people: everyone, you: "Sam", selected: "Sam", pressed: 1 },
  G: { theme: "light", view: "split", sheet: "breakdown", items, people: everyone, you: "Sam", selected: "Sam" },
  H: { theme: "light", view: "split", sheet: "breakdown", items, people: everyone, you: "Sam", selected: "Priya" },
  I1: { theme: "light", view: "split", sheet: "detail", items, people: everyone, you: "Sam", selected: "Sam", detail: 2, top: 196 },
  I2: { theme: "light", view: "split", sheet: "detail", items: withItem(2, { mode: "shares", by: { Jason: 2, Sam: 1 } }), people: everyone, you: "Sam", selected: "Sam", detail: 2, top: 196 },
  I2b: { theme: "light", view: "split", sheet: "detail", items: withItem(2, { mode: "amounts", by: { Jason: 75, Sam: 25 } }), people: everyone, you: "Sam", selected: "Sam", detail: 2, top: 196 },
  I3: { theme: "light", view: "split", sheet: "history", items: withItem(3, { cents: 275 }), people: everyone, you: "Sam", selected: "Sam", history: HISTORY, top: 500 },
  JC: { theme: "dark", view: "split", sheet: "pick", items: noClaims, people: people(["Jason"]), top: 170 },
  JF: { theme: "dark", view: "split", sheet: "regular", items, people: everyone, you: "Sam", selected: "Sam" },
};

for (const [id, st] of Object.entries(FRAMES)) {
  const el = document.getElementById("frame-" + id);
  if (!el) continue;
  el.classList.add(st.theme);
  el.innerHTML = render(st);
}
