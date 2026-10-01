import type { PaymentService } from "../core/split";

export const copy = {
  wordmark: "Receipt Splitter",
  example: "Example",
  hero: {
    phone: { title: "Add receipt", hint: "Take or upload a photo" },
    desktop: { title: "Drop a receipt", hint: "Click to choose a photo, or paste one." },
  },
  paymentApp: "Payment app",
  addApp: "Add another payment app",
  people: "People at the table",
  me: "Me",
  addName: { label: "Add", name: "Add a name" },
  action: "Create split link",
  replace: "Replace receipt",
};

export const paymentApps: Record<PaymentService, { name: string; glyph: string; hint: string }> = {
  venmo: { name: "Venmo", glyph: "V", hint: "@username" },
  cashApp: { name: "Cash App", glyph: "$", hint: "$cashtag" },
  paypal: { name: "PayPal", glyph: "P", hint: "paypal.me/name" },
  zelle: { name: "Zelle", glyph: "Z", hint: "Email or phone" },
};

const { phone, desktop } = copy.hero;

export const fallbackSamples = {
  400: [copy.example, phone.title, phone.hint, desktop.title, desktop.hint, paymentApps.venmo.name],
  500: [copy.wordmark, paymentApps.venmo.glyph, copy.me, copy.addName.label, copy.action],
};
