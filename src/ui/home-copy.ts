import type { PaymentService } from "../core/split";

export const copy = {
  wordmark: "Receipt Splitter",
  example: "Example",
  hero: {
    phone: { title: "Add receipt", hint: "Take or upload a photo" },
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
  removeName: (name: string) => `Remove ${name}`,
  newName: "Name",
  removeApp: (app: string) => `Remove ${app}`,
};

export const linkCopy = {
  ready: "Link ready",
  share: "Share",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Couldn't copy the link.",
  handleLocked: "Only the device that made this link can change how to pay you.",
};

export const createCopy = {
  busy: "Too many links from here. Try again in a minute.",
  daily: (opensAt: string) => `Too many new splits today. Try again after ${opensAt}.`,
  network: "Couldn't reach the server. Try again.",
  handle: "Check how to pay you.",
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

export const sheetCopy = {
  collapse: "Hide payment and names",
  expand: "Show payment and names",
};

export const editorCopy = {
  items: "Items",
  itemNumber: (n: number) => `item ${n}`,
  itemName: (n: number) => `Name of item ${n}`,
  namePlaceholder: "Item",
  priceOf: (name: string, flagged: boolean) => `Price of ${name}${flagged ? ", check this price" : ""}`,
  remove: (name: string) => `Remove ${name}`,
  addItem: "Add item",
  subtotal: "Subtotal",
  tip: "Tip",
  total: "Total",
  unreadPrice: "Could not read this price.",
  discountExceededPrice: "Its discount was more than its price.",
};

export const paymentApps: Record<PaymentService, { name: string; glyph: string; hint: string }> = {
  venmo: { name: "Venmo", glyph: "V", hint: "@username" },
  cashApp: { name: "Cash App", glyph: "$", hint: "$cashtag" },
  paypal: { name: "PayPal", glyph: "P", hint: "paypal.me/name" },
  zelle: { name: "Zelle", glyph: "Z", hint: "Email or phone" },
};

const { phone, desktop } = copy.hero;

export const fallbackSamples = {
  400: [copy.example, phone.title, phone.hint, desktop.title, desktop.hint, copy.formats, paymentApps.venmo.name],
  500: [copy.wordmark, paymentApps.venmo.glyph, copy.addYourName, copy.action],
};
