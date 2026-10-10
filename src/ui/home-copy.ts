import type { HandleProblem } from "../core/operations";
import type { PaymentService } from "../core/split";
import type { Blocker, Ready } from "../draft";
import type { Scheme } from "./appearance";
import type { ReadingStage } from "./receipt-input/reading";

export const copy = {
  wordmark: "Splitwith",
  example: "Example",
  hero: {
    phone: { title: "Add receipt", hint: null },
    desktop: { title: "Drop a receipt", hint: "Choose a photo, or paste one" },
  },
  reading: "Reading receipt",
  readingStage: {
    text: "Finding the text",
    server: "Matching items to prices",
    slow: "Taking a few more seconds",
  } satisfies Record<ReadingStage, string>,
  notPhoto: "That file is not a photo.",
  pastedPhoto: "Pasted photo",
  formats: "JPEG, PNG, or WebP",
  paymentApp: "Payment app",
  addApp: "Another way to get paid",
  optional: "Optional",
  people: "People at the table",
  you: "you",
  addName: { label: "Add", name: "Add a name" },
  addYourName: "Add name",
  yourName: "Your name",
  action: "Create split link",
  creating: "Creating link",
  replace: "Replace receipt",
  viewPhoto: "View receipt photo",
  closePhoto: "Close photo",
  removeName: (name: string) => `Remove ${name}`,
  newName: "Name",
  removeApp: (app: string) => `Remove ${app}`,
  menu: "Menu",
  mode: { light: "Light mode", dark: "Dark mode" } satisfies Record<Scheme, string>,
  history: "History",
};

export const createCopy = {
  busy: "Too many links from here. Try again in a minute.",
  daily: (opensAt: string, tomorrow: boolean) => `Too many new splits today. Try again ${tomorrow ? "tomorrow " : ""}after ${opensAt}.`,
  network: "Couldn't reach the server. Try again.",
  handle: "Check how to pay you.",
  other: "Couldn't create the link. Try again.",
};

const handleWords: Record<PaymentService, { one: string; many: string; sigil: string; use: string }> = {
  venmo: { one: "Venmo username", many: "Venmo usernames", sigil: "@", use: " Use letters, numbers, hyphens or underscores." },
  cashApp: { one: "cashtag", many: "Cashtags", sigil: "$", use: " Use letters and numbers." },
  paypal: { one: "PayPal handle", many: "PayPal handles", sigil: "", use: "" },
  zelle: { one: "Zelle handle", many: "Zelle handles", sigil: "", use: "" },
};

const characterName = (character: string) => (character === " " ? "a space" : /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(character) ? `"${character}"` : "an invisible character");

function handleReason(service: PaymentService, problem: HandleProblem): string {
  const { one, many, sigil, use } = handleWords[service];
  switch (problem.kind) {
    case "short":
      return problem.length === 0 ? `Add your ${one} after the ${sigil}.` : `${many} need at least ${problem.limit} characters. This one has ${problem.length}.`;
    case "long":
      return `${many} can have at most ${problem.limit} characters. This one has ${problem.length}.`;
    case "character":
      return `${many} can't have ${characterName(problem.character)}.${use}`;
    case "noLetter":
      return `${many} need at least one letter.`;
  }
}

/** The quiet line under a gray Create split link, or null when a tap creates the Split. */
export function blockerText(found: Blocker | Ready): string | null {
  switch (found.kind) {
    case "ready":
      return null;
    case "note":
      return found.note;
    case "noName":
      return "Add your name.";
    case "badHandle":
      return handleReason(found.service, found.problem);
  }
}

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
  /** The Split page's wordmark opens a fresh home; its name starts with the visible wordmark (WCAG 2.5.3). */
  wordmarkHome: "Splitwith, split a receipt",
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
  paypal: { name: "PayPal", glyph: "P", hint: "username" },
  zelle: { name: "Zelle", glyph: "Z", hint: "Email or phone" },
};

const { phone, desktop } = copy.hero;

export const fallbackSamples = {
  400: [copy.example, desktop.hint, copy.formats, paymentApps.venmo.name, copy.addYourName, copy.action, copy.optional],
  600: [copy.wordmark, paymentApps.venmo.glyph, phone.title, desktop.title],
};
