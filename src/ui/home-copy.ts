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
    byHand: "I\u2019ll add the items myself.",
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
    yourName: "your name",
    name: "name",
  },
  addReceipt: "Add the receipt",
  tryAnotherPhoto: "Try another photo",
  addByHand: "add the items myself",
  readingStage: {
    start: "Reading the receipt",
    text: "Finding the text",
    server: "Matching prices",
    slow: "Nearly done",
  } satisfies Record<ReadingStage, string>,
  notPhoto: "That file is not a photo.",
  scanOffline: "You're offline.",
  paymentApp: "Payment app",
  addSecondApp: "Add a second app",
  addAnotherApp: "Add another app",
  you: "you",
  addFriendsName: "Add friends",
  yourName: "Your name",
  newName: "Name",
  placeField: "Place",
  placeName: (place: string) => `Place, ${place}. Edit`,
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
  offline: "You're offline.",
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

const visible = (character: string) => /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(character);
const characterName = (character: string) => (character === " " ? "spaces" : visible(character) ? `"${character}"` : "an invisible character");

function handleReason(service: PaymentService, problem: HandleProblem): string {
  const { one, many, sigil, use } = handleWords[service];
  switch (problem.kind) {
    case "short":
      return problem.length === 0 ? `Add your ${one} after the ${sigil}.` : `${many} need at least ${problem.limit} characters.`;
    case "long":
      return `${many} have at most ${problem.limit} characters.`;
    case "character":
      // Only a wrong symbol gets the allowed set: a space or a hidden character is fixed by deleting it, and the hint would wrap the line to three.
      return `${paymentApps[service].name} can't use ${characterName(problem.character)}.${visible(problem.character) ? use : ""}`;
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
  /** Everyone in the Split, the person looking at the list too: three names at most, then a count of the rest. */
  names: (everyone: readonly string[]) => {
    if (everyone.length <= 2) return everyone.join(" and ");
    if (everyone.length === 3) return `${everyone[0]}, ${everyone[1]} and ${everyone[2]}`;
    return `${everyone[0]}, ${everyone[1]} and ${everyone.length - 2} more`;
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
  /** Who paid the bill: `null` is this device's person. */
  paid: (host: string | null) => (host === null ? "You paid" : `${host} paid`),
  row: (names: string, when: string, people: string, total: string, place: string | undefined, paid: string) => `${place === undefined ? "" : `${place}, `}${names}, ${when}, ${people}, ${total}, ${paid}`,
  /** A Split with a place leads with it; the names move down beside the day, in place of the head count. */
  lines: (place: string | undefined, who: string, when: string, people: string) => (place === undefined ? { first: who, second: `${when} \u00b7 ${people}` } : { first: place, second: `${when} \u00b7 ${who}` }),
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
    copy.sentence.iAm,
    copy.sentence.hereWith,
    copy.sentence.addFriends,
    "Add your name first.",
  ],
  500: [copy.wordmark, copy.action],
};
