import type { PaymentService } from "../core/split";

export const copy = {
  wordmark: "Receipt Splitter",
  example: "Example",
  hero: {
    phone: { title: "Add receipt", hint: null },
    desktop: { title: "Drop a receipt", hint: "Choose a photo, or paste one" },
  },
  reading: "Reading receipt",
  notPhoto: "That file is not a photo.",
  formats: "JPEG, PNG, or WebP",
  pastedPhoto: "Pasted photo",
  paymentApp: "Payment app",
  addApp: "Add another payment app",
  people: "People at the table",
  addName: { label: "Add", name: "Add a name" },
  addYourName: "Your name",
  yourName: "Your name",
  action: "Create split link",
  creating: "Creating link",
  replace: "Replace receipt",
  total: "Total",
  viewPhoto: "View receipt photo",
  closePhoto: "Close photo",
  removeName: (name: string) => `Remove ${name}`,
  newName: "Name",
  removeApp: (app: string) => `Remove ${app}`,
};

export const createCopy = {
  busy: "Too many links from here. Try again in a minute.",
  daily: (opensAt: string, tomorrow: boolean) => `Too many new splits today. Try again ${tomorrow ? "tomorrow " : ""}after ${opensAt}.`,
  network: "Couldn't reach the server. Try again.",
  handle: "Check how to pay you.",
  noHandle: "Add how to pay you.",
  other: "Couldn't create the link. Try again.",
};

export const joinCopy = {
  opening: "Opening split",
  question: "Which one are you?",
  taken: "Picked on another device",
  someoneElse: "Someone else",
  yourName: "Your name",
  join: "Join",
  nameNeeded: "Type your name.",
  nameTaken: "That name is already here.",
  nameRefused: "Couldn't add that name. Try another.",
  joinFailed: "Couldn't join. Try again.",
  atTheTable: "At the table",
  newSplit: "Split a receipt",
  expired: { title: "This split has expired", hint: "A split lasts 60 days after its last change." },
  unreadable: { title: "This split can't be opened", hint: "Ask whoever sent the link to make a new one." },
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOf = (time: number) => new Date(time).setHours(0, 0, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

export const historyCopy = {
  title: "Recent splits",
  names: (names: readonly string[]) => {
    if (names.length <= 2) return names.join(" and ");
    const [first, second, ...rest] = names;
    return `${first}, ${second}, and ${rest.length === 1 ? rest[0] : `${rest.length} more`}`;
  },
  when: (added: number, now: number) => {
    const days = Math.round((dayOf(now) - dayOf(added)) / DAY_MS);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    const date = new Date(added);
    const day = `${months[date.getMonth()]} ${date.getDate()}`;
    return date.getFullYear() === new Date(now).getFullYear() ? day : `${day}, ${date.getFullYear()}`;
  },
  row: (names: string, when: string, total: string) => `${names}, ${when}, ${total}`,
};

export const paymentApps: Record<PaymentService, { name: string; glyph: string; hint: string }> = {
  venmo: { name: "Venmo", glyph: "V", hint: "@username" },
  cashApp: { name: "Cash App", glyph: "$", hint: "$cashtag" },
  paypal: { name: "PayPal", glyph: "P", hint: "paypal.me/name" },
  zelle: { name: "Zelle", glyph: "Z", hint: "Email or phone" },
};

const { phone, desktop } = copy.hero;

export const fallbackSamples = {
  400: [copy.example, phone.title, desktop.title, desktop.hint, copy.formats, paymentApps.venmo.name],
  500: [copy.wordmark, paymentApps.venmo.glyph, copy.addYourName, copy.action],
};
