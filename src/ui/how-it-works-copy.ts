/** The How it works page, said once for the in-app screen (app/how-it-works.tsx) and checked against the plain HTML copy that search engines read (public/how-it-works.html). */
export const howCopy = {
  title: "How the SplitWith Receipt Splitter Works",
  lead: "The free receipt splitter.",
  rest: "Snap the receipt, share a link, get paid back.",
  start: "Split a receipt",
  note: "No app, no sign-up.",
  stepsHead: "How it works",
  steps: [
    { head: "Snap the receipt", text: "Take a photo or pick a screenshot. SplitWith reads every item and price." },
    { head: "Share one link", text: "Friends open it in any browser and tap what they had." },
    { head: "Get paid back", text: "Tax and tip split fairly. Each friend pays you on Venmo, Cash App, PayPal or Zelle." },
  ],
  questionsHead: "Questions",
  questions: [
    { ask: "Is it free?", answer: "Yes. No ads, and no accounts for you or your friends." },
    { ask: "Can I use a photo I already took?", answer: "Yes. Camera roll photos and screenshots of online orders both work." },
    { ask: "What if an item is read wrong?", answer: "Tap it to fix it. SplitWith shows any gap between the items and the subtotal." },
    { ask: "Other currencies?", answer: "Yes. Tap the total to change it." },
  ],
} as const;
