import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { runTotalCheck } from "../src/core/total-check.ts";

const BENCH = import.meta.dirname;
const CACHE = join(BENCH, ".cache");
const DATA = join(BENCH, "data");
const LABELS = join(BENCH, "labels");
const MAX_SIDE_PX = 1280;
const JPEG_QUALITY = 70;
const SKEW_DEGREES = 7;
const HEADERS = { "user-agent": "receipt-splitter-bench/1 (+https://github.com/JasonZhangggg/receipt-splitter)" };

const SOURCES = {
  srd: {
    url: "https://expressexpense.com/large-receipt-image-dataset-SRD.zip",
    md5: "c8eb0f2d286da5ab742e7a5b59f15147",
  },
  zenodo: {
    url: "https://zenodo.org/api/records/13688441/files/Dataset.zip/content",
    md5: "b7a29ba1cfab963714782e1752ce8e62",
  },
  cord: {
    url: "https://datasets-server.huggingface.co/rows?dataset=naver-clova-ix/cord-v2&config=default&split=test",
    rows: 100,
    revision: "7f0115a4b758a71d6473b8d085751692da2fef98",
  },
  docjay131: {
    url: "https://datasets-server.huggingface.co/rows?dataset=docjay131/receipts-ocr-dataset&config=default&split=train",
    rows: 230,
    revision: "ffb6088ef715689558289378fd26259f02f9910e",
  },
};

const SELECTED = {
  srd: {
    "1002": [], "1005": [], "1008": [], "1012": [], "1015": ["blur"], "1016": [], "1019": ["skew"], "1022": [],
    "1030": ["skew"], "1033": [], "1039": ["modifiers", "skew"], "1040": [], "1043": ["blur"], "1046": [],
    "1047": ["blur"], "1049": [], "1050": [], "1057": [], "1058": ["blur"], "1065": [], "1072": ["blur"], "1073": [],
    "1075": ["blur"], "1077": [], "1078": [], "1089": ["modifiers"], "1092": [], "1094": [], "1096": ["blur"], "1098": [],
    "1099": ["modifiers"], "1105": [], "1106": [], "1107": [], "1116": [], "1119": [], "1121": [], "1124": [],
    "1125": ["blur"], "1127": [], "1133": [], "1137": [], "1142": ["blur"], "1149": ["modifiers"], "1151": [],
    "1152": [], "1167": [], "1169": [], "1174": [], "1198": [],
  },
  cord: {
    "002": [], "007": [], "008": ["blur"], "014": [], "016": [], "020": [], "028": [], "029": [], "031": [], "033": [],
    "036": [], "038": [], "046": [], "053": [], "063": [], "070": [], "074": [], "078": [], "094": [], "098": [],
  },
  docjay131: {
    "003": ["skew"], "005": ["blur"], "015": ["handwritten"], "065": ["modifiers"],
    "078": ["tipBlock", "modifiers"], "084": ["handwritten"], "111": ["skew"], "122": [], "147": ["blur"],
    "148": ["signatureSlip"], "168": ["skew"], "170": ["modifiers", "skew"],
  },
};

function shrunk(original) {
  const input = join(CACHE, "shrink-in.jpg");
  const output = join(CACHE, "shrink-out.jpg");
  writeFileSync(input, original);
  const size = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", input], { encoding: "utf8" });
  const longSide = Math.max(...[...size.matchAll(/pixel(?:Width|Height): (\d+)/g)].map(([, px]) => Number(px)));
  const resize = longSide > MAX_SIDE_PX ? ["-Z", String(MAX_SIDE_PX)] : [];
  execFileSync("sips", [...resize, "-s", "format", "jpeg", "-s", "formatOptions", String(JPEG_QUALITY), input, "--out", output], { stdio: "ignore" });
  const recompressed = readFileSync(output);
  return withoutMetadata(recompressed.length < original.length ? recompressed : original);
}

function withoutMetadata(jpeg) {
  const kept = [jpeg.subarray(0, 2)];
  let at = 2;
  while (at < jpeg.length && jpeg[at] === 0xff && jpeg[at + 1] !== 0xda) {
    const end = at + 2 + jpeg.readUInt16BE(at + 2);
    if (![0xe1, 0xed, 0xfe].includes(jpeg[at + 1])) kept.push(jpeg.subarray(at, end));
    at = end;
  }
  return Buffer.concat([...kept, jpeg.subarray(at)]);
}

async function get(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}; delete bench/.cache to refresh signed URLs`);
  return response;
}

async function download(name, { url, md5 }) {
  const path = join(CACHE, name);
  if (!existsSync(path)) writeFileSync(path, Buffer.from(await (await get(url)).arrayBuffer()));
  const bytes = readFileSync(path);
  const digest = createHash("md5").update(bytes).digest("hex");
  if (digest !== md5) throw new Error(`${name} has md5 ${digest}, expected ${md5}`);
  return path;
}

async function unzipped(name, source) {
  const dir = join(CACHE, name);
  if (!existsSync(dir)) execFileSync("unzip", ["-qo", await download(`${name}.zip`, source), "-d", dir]);
  return dir;
}

async function datasetRows(name, { url, rows, revision }) {
  const path = join(CACHE, `${name}.json`);
  if (!existsSync(path)) {
    const pages = [];
    for (let offset = 0; offset < rows; offset += 100) {
      const { rows: page } = await (await get(`${url}&offset=${offset}&length=100`)).json();
      pages.push(...page.map(({ row }) => row));
    }
    writeFileSync(path, JSON.stringify(pages));
  }
  const pages = JSON.parse(readFileSync(path, "utf8"));
  const moved = pages.find((row) => !row.image.src.includes(`/--/${revision}/--/`));
  if (moved) throw new Error(`${name} rows are not at pinned revision ${revision}: ${moved.image.src.split("?")[0]}`);
  return pages;
}

async function fetchImage(url) {
  return Buffer.from(await (await get(url)).arrayBuffer());
}

async function srdCandidates(zenodo) {
  const images = await unzipped("srd", SOURCES.srd);
  const transcriptions = join(zenodo, "Labels");
  const skewed = skewedImages(readFileSync(join(zenodo, "homography.csv"), "utf8"));
  return readdirSync(transcriptions)
    .filter((file) => file.endsWith("-receipt.txt"))
    .map((file) => {
      const sourceId = file.replace("-receipt.txt", "");
      const text = readFileSync(join(transcriptions, file), "utf8");
      const draft = draftFromTranscription(text);
      return {
        source: "srd",
        sourceId,
        name: `srd-${sourceId}`,
        region: "US",
        features: [...textFeatures(text), ...(skewed.has(sourceId) ? ["skew"] : []), ...discountFeature(draft)],
        draft,
        image: () => readFileSync(join(images, `${sourceId}-receipt.jpg`)),
      };
    });
}

async function cordCandidates() {
  const rows = await datasetRows("cord", SOURCES.cord);
  return rows.map((row, index) => {
    const { gt_parse: parsed } = JSON.parse(row.ground_truth);
    const sourceId = String(index).padStart(3, "0");
    return {
      source: "cord",
      sourceId,
      name: `cord-${sourceId}`,
      region: "ID",
      features: cordFeatures(parsed),
      draft: draftFromCord(parsed),
      image: () => fetchImage(row.image.src),
    };
  });
}

async function docjayCandidates(zenodo) {
  const rows = await datasetRows("docjay131", SOURCES.docjay131);
  const srdTexts = readdirSync(join(zenodo, "Labels")).map((file) => readFileSync(join(zenodo, "Labels", file), "utf8"));
  return rows.flatMap((row, index) => {
    const parsed = JSON.parse(row.text);
    const inSrd = srdTexts.some((text) => [parsed.subtotal, parsed.total].every((amount) => typeof amount === "number" && text.includes(amount.toFixed(2))));
    if (inSrd) return [];
    const sourceId = String(index).padStart(3, "0");
    return [
      {
        source: "docjay131",
        sourceId,
        name: `docjay131-${sourceId}`,
        region: "US",
        features: [parsed.tip ? "tip" : null, parsed.items?.some(({ name }) => DOCJAY_MODIFIER.test(name)) ? "modifiers" : null].filter(Boolean),
        draft: draftFromDocjay(parsed),
        image: () => fetchImage(row.image.src),
      },
    ];
  });
}

const PRICE_AT_END = /(-?)\s*\$?\s*(-?)\s*(\d{1,6}(?:,\d{3})*)[.,](\d{2})\s*[A-Z]{0,2}\s*$/;
const SUBTOTAL = /sub\s*-?\s*total|sub\s+w\/\s*tax|^amount\b/i;
const TOTAL = /^\s*(grand\s+)?total\b|amount\s+due|balance\s+due|total\s+due/i;
const NOT_THE_TOTAL = /tax|before|sales|tip\s+total|qty|items?\b/i;
const STOP = /\bcash\b|change|tender|visa|master|amex|discover|card|suggest|guide|helper|recommend|^\s*\(?\d+(\.\d+)?\s*%\s*(of\b|[:=($\d])/i;
const DISCOUNT = /discount|coupon|promo|\boff\b|\bcomp\b|reward/i;
const DOCJAY_MODIFIER = /^\s*[+]|^\s*add\s/i;
const ADJUSTMENT_PATTERNS = [
  ["serviceCharge", /service|srv|svc|auto\s*grat/i],
  ["tip", /\btip\b|gratuity/i],
  ["tax", /tax|hst|gst|vat/i],
  ["discount", /discount|coupon|promo|off\b|comp\b|reward/i],
];

function skewedImages(homography) {
  const skewed = new Set();
  for (const line of homography.trim().split("\n").slice(1)) {
    const [id, ...corners] = line.split(";");
    const [[x1, y1], [x2, y2], [x3, y3]] = corners.map((corner) => corner.split(",").map(Number));
    const degrees = (rise, run) => Math.abs((Math.atan2(rise, run) * 180) / Math.PI);
    if (Math.max(degrees(y2 - y1, x2 - x1), degrees(x3 - x1, y3 - y1)) >= SKEW_DEGREES) skewed.add(id);
  }
  return skewed;
}

function textFeatures(text) {
  const features = new Set();
  if (/suggest|tip guide|tip helper|recommended (tip|gratuity)|tip suggestions/i.test(text)) features.add("tipBlock");
  if (/signature|x_{3,}|cardholder|customer copy|merchant copy|approved|auth(orization)?\s*(code|#)/i.test(text)) features.add("signatureSlip");
  if (/service charge|service fee|srv chg|auto\s*grat/i.test(text)) features.add("serviceCharge");
  if (/^\s*[+]|^\s*(add|no|extra|with)\s/im.test(text)) features.add("modifiers");
  if (/^\s*(tip|gratuity)\b.*\d[.,]\d{2}/im.test(text)) features.add("tip");
  return [...features];
}

function discountFeature(draft) {
  return draft?.adjustments.some(({ kind }) => kind === "discount") ? ["discount"] : [];
}

function priceOf(line) {
  const match = PRICE_AT_END.exec(line);
  if (!match) return null;
  const [, minus, innerMinus, whole, fraction] = match;
  const amount = Number(whole.replaceAll(",", "")) * 100 + Number(fraction);
  const name = line.slice(0, match.index).replace(/\s+$/, "");
  return { amount: minus || innerMinus || /^\s*-/.test(line) ? -amount : amount, name };
}

function rowName(raw, fallback) {
  const name = raw.replace(/^\s*\d+\s+(?=\S)/, "").replace(/[\s$@:.-]+$/, "").trim();
  return [...(name || fallback)].slice(0, 80).join("");
}

function draftFromTranscription(text) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/[\u0000-\u001F\u007F]/g, " ").trim());
  const priced = lines.flatMap((line, index) => {
    const price = priceOf(line);
    return price ? [{ ...price, line, index }] : [];
  });
  const subtotalAt = priced.findIndex(({ name, amount }) => SUBTOTAL.test(name) && amount > 0);
  if (subtotalAt <= 0) return null;
  const stopAt = priced.findIndex((row, at) => at > subtotalAt && STOP.test(row.name));
  const tail = priced.slice(subtotalAt + 1, stopAt === -1 ? undefined : stopAt);
  const totalAt = tail.findLastIndex(({ name }) => TOTAL.test(name) && !NOT_THE_TOTAL.test(name));
  if (totalAt === -1) return null;

  const items = [];
  const discounts = [];
  for (const row of priced.slice(0, subtotalAt)) {
    const isModifier = /^\s*[+]|^\s*add\s|\+\s*\$?\d/i.test(row.line) || (row.amount === 0 && !/^\s*\d+\s/.test(row.line));
    if (row.amount < 0 || DISCOUNT.test(row.name)) discounts.push({ kind: "discount", name: rowName(row.name, "Discount"), amount: -Math.abs(row.amount) });
    else if (isModifier && items.length > 0) items[items.length - 1].price += row.amount;
    else items.push({ name: rowName(row.name, "Item"), price: row.amount });
  }
  const charges = tail.slice(0, totalAt).filter((row) => row.amount !== 0 && !SUBTOTAL.test(row.name));
  const taxLines = charges.filter(({ name }) => /tax/i.test(name) && !TOTAL.test(name));
  const adjustments = [...discounts];
  for (const row of charges) {
    if (TOTAL.test(row.name) && !(/tax/i.test(row.name) && taxLines.length === 0)) continue;
    const kind = ADJUSTMENT_PATTERNS.find(([, pattern]) => pattern.test(row.name))?.[0] ?? (row.amount < 0 ? "discount" : null);
    if (kind) adjustments.push({ kind, name: rowName(row.name, kind), amount: row.amount });
  }
  if (items.length === 0) return null;
  const itemsSum = items.reduce((sum, { price }) => sum + price, 0);
  const discounted = discounts.reduce((sum, { amount }) => sum + amount, 0);
  const printedSubtotal = priced[subtotalAt].amount;
  const subtotal = discounted !== 0 && printedSubtotal === itemsSum + discounted ? itemsSum : printedSubtotal;
  return receipt(items, adjustments, subtotal, tail[totalAt].amount);
}

function receipt(items, adjustments, subtotal, total) {
  return {
    items: items.map(({ name, price }, index) => ({ id: `i${index + 1}`, name, price })),
    adjustments: adjustments.map(({ kind, name, amount }, index) => ({ id: `a${index + 1}`, kind, name, amount })),
    subtotal,
    total,
  };
}

function rupiah(value) {
  if (typeof value !== "string" || !/\d/.test(value)) return null;
  const amount = Number(value.replace(/\D/g, ""));
  return /^\s*-|\(/.test(value) ? -amount : amount;
}

function list(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function cordFeatures(parsed) {
  const sub = parsed.sub_total ?? {};
  return [
    sub.service_price ? "serviceCharge" : null,
    sub.tax_price ? "tax" : null,
    [sub.discount_price, ...list(parsed.menu).map((menu) => menu.discountprice)].some((value) => rupiah(value)) ? "discount" : null,
    list(parsed.menu).some((menu) => menu.sub) ? "modifiers" : null,
  ].filter(Boolean);
}

function draftFromCord(parsed) {
  const items = list(parsed.menu).flatMap((menu) => {
    const price = rupiah(menu.price);
    if (price === null || price < 0) return [];
    const modifiers = list(menu.sub).reduce((sum, sub) => sum + Math.max(rupiah(sub.price) ?? 0, 0), 0);
    const discount = Math.abs(rupiah(menu.discountprice) ?? 0);
    return [{ name: rowName(String(menu.nm ?? ""), "Item"), price: Math.max(price + modifiers - discount, 0) }];
  });
  if (items.length === 0) return null;
  const sub = parsed.sub_total ?? {};
  const adjustments = [
    ["tax", "Tax", sub.tax_price],
    ["serviceCharge", "Service", sub.service_price],
    ["discount", "Discount", sub.discount_price],
  ].flatMap(([kind, name, value]) => {
    const amount = rupiah(typeof value === "string" ? value : undefined);
    if (!amount) return [];
    return [{ kind, name, amount: kind === "discount" ? -Math.abs(amount) : amount }];
  });
  const itemsSum = items.reduce((sum, { price }) => sum + price, 0);
  const total = rupiah(list(parsed.total)[0]?.total_price);
  if (total === null) return null;
  return receipt(items, adjustments, rupiah(sub.subtotal_price) ?? itemsSum, total);
}

function draftFromDocjay(parsed) {
  const cents = (dollars) => Math.round(dollars * 100);
  const items = [];
  for (const { name, totalPrice } of parsed.items ?? []) {
    if (typeof totalPrice !== "number") continue;
    if (DOCJAY_MODIFIER.test(name) && items.length > 0) items[items.length - 1].price += cents(totalPrice);
    else if (totalPrice >= 0) items.push({ name: rowName(name, "Item"), price: cents(totalPrice) });
  }
  if (items.length === 0 || typeof parsed.total !== "number") return null;
  const adjustments = [
    ["tax", "Tax", parsed.tax],
    ["tip", "Tip", parsed.tip],
  ].flatMap(([kind, name, dollars]) => (typeof dollars === "number" && dollars !== 0 ? [{ kind, name, amount: cents(dollars) }] : []));
  const itemsSum = items.reduce((sum, { price }) => sum + price, 0);
  return receipt(items, adjustments, typeof parsed.subtotal === "number" ? cents(parsed.subtotal) : itemsSum, cents(parsed.total));
}

async function main() {
  const { values: flags } = parseArgs({ options: { survey: { type: "boolean" }, redraft: { type: "boolean" } } });

  mkdirSync(CACHE, { recursive: true });
  const zenodo = await unzipped("zenodo", SOURCES.zenodo);
  const candidates = [...(await srdCandidates(zenodo)), ...(await cordCandidates()), ...(await docjayCandidates(zenodo))];

  if (flags.survey) {
    for (const { name, region, draft, features } of candidates) {
      const check = draft ? runTotalCheck(draft) : null;
      console.log(JSON.stringify({ name, region, features, items: draft?.items.length ?? 0, check: check?.ok ?? "no draft", gap: check && !check.ok ? [check.subtotalGap, check.totalGap] : undefined }));
    }
  } else {
    mkdirSync(DATA, { recursive: true });
    mkdirSync(LABELS, { recursive: true });
    const selected = candidates.filter((candidate) => SELECTED[candidate.source][candidate.sourceId]);
    const names = new Set(selected.map(({ name }) => name));
    for (const file of [...readdirSync(DATA).map((file) => join(DATA, file)), ...readdirSync(LABELS).map((file) => join(LABELS, file))]) {
      if (/\.(jpg|json)$/.test(file) && !names.has(basename(file).replace(/\.(jpg|json)$/, ""))) rmSync(file);
    }
    for (const candidate of selected) {
      const image = `${candidate.name}.jpg`;
      const imagePath = join(DATA, image);
      const labelPath = join(LABELS, `${candidate.name}.json`);
      const existing = existsSync(labelPath) ? JSON.parse(readFileSync(labelPath, "utf8")) : {};
      const reviewed = flags.redraft ? {} : existing;
      let { sourceSha256 } = existing;
      if (!existsSync(imagePath)) {
        const original = await candidate.image();
        const digest = createHash("sha256").update(original).digest("hex");
        if (sourceSha256 && digest !== sourceSha256) throw new Error(`${candidate.name} source image has sha256 ${digest}, pinned ${sourceSha256}`);
        sourceSha256 = digest;
        writeFileSync(imagePath, shrunk(original));
      }
      if (!sourceSha256) throw new Error(`${candidate.name} has no pinned source sha256; delete ${imagePath} to fetch and pin it`);
      const label = {
        image,
        source: candidate.source,
        sourceId: candidate.sourceId,
        region: candidate.region,
        sourceSha256,
        tags: [...new Set([...candidate.features, ...SELECTED[candidate.source][candidate.sourceId]])],
        checked: reviewed.checked ?? false,
        ...(reviewed.note ? { note: reviewed.note } : {}),
        receipt: reviewed.receipt ?? candidate.draft,
      };
      writeFileSync(labelPath, `${JSON.stringify(label, null, 2)}\n`);
    }
    const counts = Object.fromEntries(Object.entries(SELECTED).map(([source, ids]) => [source, Object.keys(ids).length]));
    console.log(JSON.stringify({ ok: true, selected: counts }));
  }
}

await main();
