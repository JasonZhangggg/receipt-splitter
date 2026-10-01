// Throwaway prototype, round 4. One draft shape, fixed states chosen by ?s=&t=.
const RECEIPT = {
  merchant: "Sukhothai Sushi + Asian Fusion",
  items: [
    { id: "i1", name: "Chicken Fried Rice And Egg", cents: 799 },
    { id: "i2", name: "California Tropic And Miso", cents: 799 },
    { id: "i3", name: "Add Two Tostones", cents: 100 },
    { id: "i4", name: "Sprite", cents: 250 },
    { id: "i5", name: "Perrier Sparkling Water", cents: 350, misread: 300 },
  ],
  // The tip is read from the receipt like any other Adjustment. SRD 1040 prints none, so the draft assumes a handwritten $4.60.
  adjustments: [
    { id: "a1", kind: "tax", name: "Tax", cents: 161 },
    { id: "a2", kind: "service", name: "Service fee", cents: 345 },
    { id: "a3", kind: "tip", name: "Tip", cents: 460 },
  ],
  subtotal: 2298,
};
const APPS = [
  { id: "venmo", name: "Venmo", hint: "@username", glyph: "V" },
  { id: "cashapp", name: "Cash App", hint: "$cashtag", glyph: "$" },
  { id: "paypal", name: "PayPal", hint: "paypal.me/name", glyph: "P" },
  { id: "zelle", name: "Zelle", hint: "Email or phone", glyph: "Z" },
];

function draftFor(s) {
  const base = { phase: "empty", fixed: false, handle: null, people: ["Me"], link: null };
  if (s === "reading") return { ...base, phase: "reading", handle: { app: "venmo", value: "@jason-z" } };
  const read = { ...base, phase: "read", handle: { app: "venmo", value: "@jason-z" }, people: ["Me", "Sam", "Priya"] };
  if (s === "read") return read;
  if (s === "ready") return { ...read, fixed: true };
  if (s === "link") return { ...read, fixed: true, link: "receiptsplitter.app/s/k7Qm2x" };
  return base;
}
const items = (d) => RECEIPT.items.map((it) => ({ ...it, cents: !d.fixed && it.misread ? it.misread : it.cents, flagged: !d.fixed && !!it.misread }));
function totalCheck(d) {
  const sum = items(d).reduce((a, it) => a + it.cents, 0);
  return { sum, gap: RECEIPT.subtotal - sum, ok: sum === RECEIPT.subtotal };
}
const total = () => RECEIPT.subtotal + RECEIPT.adjustments.reduce((a, x) => a + x.cents, 0);
const money = (c) => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toFixed(2);
const plain = (c) => (c / 100).toFixed(2);

// One short reason the action is off, or null when it can create the Split.
function blocker(d) {
  if (d.phase === "empty") return "Add a receipt.";
  if (d.phase === "reading") return "Reading.";
  const c = totalCheck(d);
  if (!c.ok) return `Items are ${money(Math.abs(c.gap))} ${c.gap > 0 ? "short" : "over"}.`;
  if (!d.handle) return "Add how to pay you.";
  return null;
}

const ICONS = {
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  share: '<path d="M12 4v11M8 8l4-4 4 4"/><path d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6.5A1.5 1.5 0 0 0 14.5 5h-8A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  pencil: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/>',
  receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6"/>',
  people: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="10" r="2.3"/><path d="M15.5 14.6A4.5 4.5 0 0 1 21 19"/>',
};
const icon = (n, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

const params = new URLSearchParams(location.search);
const STATE = params.get("s") || "empty";
document.documentElement.dataset.theme = params.get("t") || "light";
const D = draftFor(STATE);
const desktop = () => window.innerWidth >= 900;
const ACCEPT = "image/*";

// Shared pieces. Visible words are kept to labels the person acts on.
function payRow({ more = true } = {}) {
  const h = D.handle || { app: "venmo", value: "" };
  const app = APPS.find((a) => a.id === h.app);
  const opts = APPS.map((a) => `<option value="${a.id}"${a.id === app.id ? " selected" : ""}>${a.name}</option>`).join("");
  return `<div class="payrow"><div class="pay"><label class="picker"><span class="g" aria-hidden="true">${app.glyph}</span><span>${app.name}</span>${icon("chevron", "chev")}<select aria-label="Payment app, saved on this device">${opts}</select></label>
    <input aria-label="${app.name} handle" placeholder="${app.hint}" value="${h.value}" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" /></div>
    ${more ? `<button class="more press" aria-label="Add another payment app">${icon("plus")}</button>` : ""}</div>`;
}
function namesRow() {
  const chips = D.people.map((p) => `<span class="chip">${p}</span>`).join("");
  return `<div class="names" role="group" aria-label="People at the table">${chips}<button class="chip add press">${icon("plus")}Add</button></div>`;
}
function receiptBody() {
  const rows = items(D).map((it) => `<div class="it${it.flagged ? " flag" : ""}"><input class="name" value="${it.name}" aria-label="Item name" /><input class="price" inputmode="decimal" value="${plain(it.cents)}" aria-label="Price of ${it.name}${it.flagged ? ", check this price" : ""}" /></div>`).join("");
  const adj = RECEIPT.adjustments.map((a) => a.kind === "tip"
    ? `<button class="a press" aria-label="Tip ${money(a.cents)}, change"><span>Tip</span><b>${money(a.cents)}${icon("pencil")}</b></button>`
    : `<div class="a"><span>${a.name}</span><b>${money(a.cents)}</b></div>`).join("");
  return `<div class="rc-items">${rows}</div><div class="rc-adj"><div class="a"><span>Subtotal</span><b>${money(RECEIPT.subtotal)}</b></div>${adj}</div><div class="rc-total"><span>Total</span><b>${money(total())}</b></div>`;
}
function receiptHead() {
  return `<div class="rc-head"><h2>${RECEIPT.merchant}</h2><button class="retake press" aria-label="Replace receipt">${icon("camera")}</button></div>`;
}
function readingBlock() {
  return `<div class="reading" role="status"><div class="thumb"><div class="sweep live"></div></div><div style="flex:1;min-width:0"><b>Reading receipt</b><div class="bar-fill"><i style="width:64%"></i></div></div></div>`;
}
function actionBlock() {
  if (D.link) return `<div class="linkbox"><p><b>Link ready</b>&ensp;${D.link}</p><div class="two"><button class="action press">${icon("share")}Share</button><button class="ghost press">${icon("copy")}Copy</button></div></div>`;
  const why = D.phase === "read" ? blocker(D) : null;
  const off = blocker(D) !== null;
  return `${why ? `<p class="why" id="why"><i class="mark">${why}</i></p>` : ""}<button class="action press" ${off ? `aria-disabled="true"${why ? ' aria-describedby="why"' : ""}` : ""}>Create split link</button>`;
}
