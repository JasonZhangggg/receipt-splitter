import type { HandleProblem } from "../core/operations";
import type { PaymentService } from "../core/split";
import type { Blocker, Ready } from "../draft";
import type { Scheme } from "./appearance";
import type { ReadingStage } from "./home-sentence/receipt-words";

export const copy = {
  wordmark: "SplitWith",
  coffee: "Buy me a coffee",
  sentence: {
    paidTheBill: "I paid the bill.",
    iPaid: "I paid",
    friendsPay: "Friends tap what they had and pay me back",
    on: "on",
    at: "at",
    or: "or",
    iAm: "I\u2019m",
    hereWith: "here with",
    and: "and",
    addFriends: "add friends",
    addMore: "add more",
    addApp: "add an app",
    yourName: "your name",
    name: "name",
  },
  addReceipt: "Add the receipt",
  tryAnotherPhoto: "Try another photo",
  readingStage: {
    start: "Reading the receipt",
    text: "Finding the text",
    server: "Matching prices",
    slow: "Taking a few more seconds",
  } satisfies Record<ReadingStage, string>,
  notPhoto: "That file is not a photo.",
  scanOffline: "No connection, so the receipt couldn't be read. Try again once you're back online.",
  paymentApp: "Payment app",
  addAppName: "Add another way to get paid",
  you: "you",
  addFriendsName: "Add friends",
  yourName: "Your name",
  newName: "Name",
  action: "Create link",
  creating: "Creating link",
  change: "Change",
  changeReceipt: "Change receipt",
  closePhoto: "Close photo",
  removeName: (name: string) => `Remove ${name}`,
  removeApp: (app: string) => `Remove ${app}`,
  themeToggle: { light: "Switch to light mode", dark: "Switch to dark mode" } satisfies Record<Scheme, string>,
};

/** Where Buy me a coffee goes: the maker's Venmo. */
export const coffeeLink = "https://venmo.com/u/Jason-Zhang-162";

export const createCopy = {
  busy: "Too many links from here. Try again in a minute.",
  daily: (opensAt: string, tomorrow: boolean) => `Too many new splits today. Try again ${tomorrow ? "tomorrow " : ""}after ${opensAt}.`,
  network: "Couldn't reach the server. Try again.",
  offline: "Check your connection and try again.",
  handle: "Check how to pay you.",
  other: "Couldn't create the link. Try again.",
};

// The reason sits beside the Create pill, so each fits two lines at 390 px: short sentences, and the app's name in place of "username".
const handleWords: Record<PaymentService, { one: string; many: string; sigil: string; use: string }> = {
  venmo: { one: "Venmo username", many: "Venmo usernames", sigil: "@", use: " Try letters, numbers, - or _." },
  cashApp: { one: "cashtag", many: "Cashtags", sigil: "$", use: " Try letters and numbers." },
  paypal: { one: "PayPal handle", many: "PayPal handles", sigil: "", use: "" },
  zelle: { one: "Zelle handle", many: "Zelle handles", sigil: "", use: "" },
};

const characterName = (character: string) => (character === " " ? "a space" : /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(character) ? `"${character}"` : "an invisible character");

function handleReason(service: PaymentService, problem: HandleProblem): string {
  const { one, many, sigil, use } = handleWords[service];
  switch (problem.kind) {
    case "short":
      return problem.length === 0 ? `Add your ${one} after the ${sigil}.` : `${many} need at least ${problem.limit} characters.`;
    case "long":
      return `${many} have at most ${problem.limit} characters.`;
    case "character":
      return `${paymentApps[service].name} can't use ${characterName(problem.character)}.${use}`;
    case "noLetter":
      return `${many} need at least one letter.`;
  }
}

/** The quiet line under a gray Create split link, or null when a tap creates the Split. */
export function blockerText(found: Blocker | Ready): string | null {
  switch (found.kind) {
    case "ready":
    case "reading":
      return null;
    case "note":
      return found.note;
    case "noName":
      return "Add your name first.";
    case "badHandle":
      return handleReason(found.service, found.problem);
  }
}

export const joinCopy = {
  opening: "Opening split",
  question: "Which one are you?",
  taken: "Picked on another device",
  yourName: "Your name",
  join: "Join",
  nameNeeded: "Type your name.",
  nameTaken: "That name is already here.",
  nameRefused: "Couldn't add that name. Try another.",
  newSplit: "Split a receipt",
  /** The Split page's wordmark opens a fresh home; its name starts with the visible wordmark (WCAG 2.5.3). */
  wordmarkHome: "SplitWith, split a receipt",
  /** The server ends a Split that never existed and one that aged out the same way, so one wording covers both. */
  missing: { title: "We can't find this split", hint: "It may have expired, or the link may be incomplete." },
  noPage: { title: "This page doesn't exist", hint: "Check the link, or start a new split." },
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
  people: (count: number) => `${count} ${count === 1 ? "person" : "people"}`,
  seeAll: (count: number) => `See all ${count}`,
  meta: (when: string, people: string) => `${when} \u00b7 ${people}`,
  row: (names: string, when: string, people: string, total: string) => `${names}, ${when}, ${people}, ${total}`,
};

export const paymentApps: Record<PaymentService, { name: string; glyph: string; hint: string }> = {
  venmo: { name: "Venmo", glyph: "V", hint: "@username" },
  cashApp: { name: "Cash App", glyph: "$", hint: "$cashtag" },
  paypal: { name: "PayPal", glyph: "P", hint: "username" },
  zelle: { name: "Zelle", glyph: "Z", hint: "email or phone" },
};

export const fallbackSamples = {
  400: [
    copy.sentence.paidTheBill,
    copy.addReceipt,
    copy.sentence.friendsPay,
    copy.sentence.on,
    paymentApps.venmo.name,
    copy.sentence.at,
    copy.sentence.or,
    copy.sentence.iAm,
    copy.sentence.hereWith,
    copy.sentence.addFriends,
    copy.sentence.addApp,
    "Add a receipt first.",
  ],
  500: [copy.wordmark, copy.action],
};
