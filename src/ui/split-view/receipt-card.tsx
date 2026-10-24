import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";

import { shareBreakdown, type Shares } from "../../core/shares";
import { claimersOf } from "../../core/operations";
import type { Adjustment, AdjustmentId, ItemId, Participant, ParticipantId, Split, SplitItem } from "../../core/split";
import { groupedAmount, money } from "../../draft";
import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { TextLink } from "../components/text-link";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { KeptRows, Presence, useEntering } from "../presence";
import { splitCopy as say } from "../split-copy";
import { motion, tabular, type, useColors } from "../theme";
import { firstName } from "../pay/pay-sheet";
import { ClaimDot } from "./dot";
import { FilterButton, FilterTabs } from "./item-filters";
import { filterCounts, filterRows, itemsHad, lineView, nameParts, quantityText, receiptRows, totalNote, claimedItems, whoHad, whoText, type BundleRow, type ItemFilter, type ReceiptRow, type Who, type Portions, type Viewing } from "./model";

type Props = {
  split: Split;
  shares: Shares;
  /** The person whose checks the dots show. */
  selected: Participant | null;
  me: ParticipantId | null;
  onCircle: (item: SplitItem, press: Press) => void;
  onOpen: (item: SplitItem, press: Press) => void;
  onAdd: (press: Press) => void;
  onOpenAdjustment: (row: Adjustment, press: Press) => void;
  /** The line whose detail is open, or an add form, so its trigger reads as expanded. */
  showing: ItemId | AdjustmentId | "add" | null;
  /** The wide layout: rows a size larger. */
  wide?: boolean;
  /** Who had each row in a column of its own between the name and the price, where the window has room. */
  whoColumn?: boolean;
  /** Which lines the list shows; the charges and the Total show only under "all". */
  filter: ItemFilter;
  onFilter: (filter: ItemFilter) => void;
  /** The phone's filter button opens its menu, which the page holds. */
  onFilterMenu: (press: Press) => void;
  filterMenuOpen: boolean;
};

// The dot's column is 26 px wide: the name starts where the charges and the Total start.
const nameStart = 26;
const columnGap = 14;
const dotTap = 44;
const dotBleed = 14;
const bleed = 12;
const chevronSize = 16;
const chevronTip = chevronSize / 8;
const nameLine = 24;
const noteLine = 20;
const chargeRow = 34;

export function ReceiptCard({ split, shares, selected, me, onCircle, onOpen, onAdd, onOpenAdjustment, showing, wide = false, whoColumn = false, filter, onFilter, onFilterMenu, filterMenuOpen }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [opened, setOpened] = useState<ReadonlySet<AdjustmentId>>(new Set());
  const { items, adjustments, subtotal, total } = split.receipt;
  const { rows: allRows, charges } = useMemo(() => receiptRows(split.receipt), [split.receipt]);
  const viewer = selected?.id ?? null;
  const rows = useMemo(() => filterRows(allRows, filter, viewer), [allRows, filter, viewer]);
  const counts = filterCounts(items, viewer);
  useFocusKept(rows, filter);
  const whose = selected && selected.id !== me ? firstName(selected.name) : null;
  const [entering, settle] = useEntering([...items, ...adjustments].map(({ id }) => id));
  // Five-figure prices need a wider price column, or the who column steps sideways on their rows.
  const priceWidth = items.some(({ price }) => price >= 1_000_000) ? 124 : 104;
  const started = items.some(({ split: item }) => claimersOf(item).length > 0);
  const note = totalNote(split.receipt);
  const viewing: Viewing = { people: split.participants, me, viewer: selected?.id ?? null };
  const portions = useMemo(() => new Map(selected ? shareBreakdown(split, selected.id).items.map(({ id, portion }) => [id, portion]) : []), [split, selected]);
  const person = (id: ParticipantId) => split.participants.find((one) => one.id === id) ?? { id, name: "" };
  const people = (item: SplitItem) => claimersOf(item.split).map(person);
  const openAdjustment = (id: AdjustmentId, press: Press) => {
    const row = split.receipt.adjustments.find((adjustment) => adjustment.id === id);
    if (row) onOpenAdjustment(row, press);
  };
  const toggle = (id: AdjustmentId) => {
    settle();
    setOpened((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  // A new Split arrives as fresh objects, so the Lines get callbacks that stay put and read the latest props.
  const latest = useRef({ onCircle, onOpen });
  useLayoutEffect(() => {
    latest.current = { onCircle, onOpen };
  });
  const circleItem = useCallback((item: SplitItem, press: Press) => latest.current.onCircle(item, press), []);
  const openItem = useCallback((item: SplitItem, press: Press) => latest.current.onOpen(item, press), []);
  const line = (item: SplitItem, inBundle: boolean) => (
    <Line
      item={item}
      viewing={viewing}
      portions={portions}
      claimers={people(item)}
      selected={selected}
      inBundle={inBundle}
      wide={wide}
      whoColumn={whoColumn}
      priceWidth={priceWidth}
      onCircle={circleItem}
      onOpen={openItem}
      expanded={showing === item.id}
    />
  );

  return (
    <View testID="receipt">
      {wide ? (
        <View style={styles.tabsLine}>
          <Text role="heading" aria-level={2} style={styles.hidden}>
            {say.itemsHeading}
          </Text>
          <FilterTabs filter={filter} counts={counts} viewer={viewer} whose={whose} onPick={onFilter} />
          <Text style={[styles.caps, { color: c.muted }]}>{say.priceHeading}</Text>
        </View>
      ) : (
        <View style={styles.heading}>
          <Text style={[type.body, styles.itemsHead]}>
            <Text role="heading" aria-level={2} style={{ color: c.ink }}>
              {say.itemsHeading}
            </Text>
            {selected ? (
              <Text testID="items-count" style={[tabular, { color: c.muted }]}>
                {`  ${say.itemsOf(itemsHad(items, selected.id), items.length, selected.id === me)}`}
              </Text>
            ) : null}
          </Text>
          <FilterButton filter={filter} counts={counts} whose={whose} open={filterMenuOpen} onOpen={onFilterMenu} />
        </View>
      )}
      {/* Keyed by the filter, so a new filter shows its rows at once; within one, a claim that moves a line out of it collapses the line as a delete does. */}
      <View key={filter} role="list" aria-label={say.item} style={[styles.list, { borderBottomColor: c.hairline }]}>
        {filter === "all" ? null : (
          // It grows in as the last line collapses out, so the two never stack at full height.
          <Presence present={rows.length === 0} animate>
            <Text testID="filter-empty" style={[type.body, styles.empty, { color: c.muted, borderTopColor: c.hairline }]}>
              {say.filterEmpty[filter]}
            </Text>
          </Presence>
        )}
        <KeptRows rows={rows} entering={entering}>
          {(row) => {
            if (row.kind === "item") return line(row.item, false);
            const { bundle } = row;
            // The header speaks for the whole Bundle under every filter; only the lines inside it change.
            const whole = allRows.find((one): one is typeof row => one.kind === "bundle" && one.id === row.id)?.bundle ?? bundle;
            const claimers = [...new Map(whole.items.flatMap(people).map((one) => [one.id, one])).values()];
            return (
              <BundleGroup
                bundle={bundle}
                open={opened.has(bundle.id)}
                claimed={claimedItems(whole, shares.unclaimed.itemIds)}
                claimers={claimers}
                who={whoHad(claimers.map(({ id }) => id), viewing)}
                onToggle={() => toggle(bundle.id)}
              >
                <KeptRows rows={bundle.items} entering={entering}>
                  {(item) => line(item, true)}
                </KeptRows>
                <PressTarget
                  name={say.openAdjustment(bundle.discount.label, money(bundle.discount.amount))}
                  popup="dialog"
                  expanded={showing === bundle.id}
                  onPress={(press) => openAdjustment(bundle.id, press)}
                  style={(pressed) => [styles.discount, { borderTopColor: c.hairline }, pressStyle(pressed, reduce)]}
                >
                  {() => (
                    <>
                      <Text numberOfLines={1} style={[type.body, styles.name, { color: c.muted }]}>
                        {bundle.discount.label}
                      </Text>
                      <Text style={[type.body, tabular, { color: c.muted }]}>{money(bundle.discount.amount)}</Text>
                    </>
                  )}
                </PressTarget>
              </BundleGroup>
            );
          }}
        </KeptRows>
      </View>
      {filter === "all" ? (
        <>
          <View style={styles.charges}>
            <Row label={say.subtotal} amount={subtotal} />
            <KeptRows rows={charges} entering={entering}>
              {(row) => (
                <PressTarget
                  name={say.openAdjustment(row.name, money(row.amount))}
                  popup="dialog"
                  expanded={showing === row.id}
                  onPress={(press) => onOpenAdjustment(row, press)}
                  style={(pressed) => [styles.row, styles.tapRow, pressStyle(pressed, reduce)]}
                >
                  {() => <RowFace label={row.name} amount={row.amount} />}
                </PressTarget>
              )}
            </KeptRows>
            <TextLink plus name={say.add} label={say.add} popup="dialog" expanded={showing === "add"} onPress={onAdd} />
            <Presence present={note !== null} animate>
              <Text role="status" style={[type.caption, styles.why, { color: c.muted }]}>
                {note}
              </Text>
            </Presence>
          </View>
          <View style={[styles.total, { borderTopColor: c.hairline }]}>
            <Text style={[type.body, { color: c.ink }]}>{say.total}</Text>
            <Text testID="total" style={[type.body, tabular, { color: c.ink }]}>
              {money(total)}
            </Text>
          </View>
          <Presence present={started && shares.unclaimed.total > 0} animate>
            <View style={styles.unclaimed}>
              <Text testID="unclaimed-count" numberOfLines={1} style={[styles.chargeText, tabular, styles.rowLabel, { color: c.muted }]}>
                {say.unclaimedTotal(shares.unclaimed.itemIds.length)}
              </Text>
              <Text testID="unclaimed" style={[styles.chargeText, tabular, { color: c.ink }]}>
                {money(shares.unclaimed.total)}
              </Text>
            </View>
          </Presence>
        </>
      ) : null}
    </View>
  );
}

const lineIds = (rows: readonly ReceiptRow[]) => rows.flatMap((row) => (row.kind === "item" ? [row.item.id] : row.bundle.items.map(({ id }) => id)));

/** The line and control (dot or line) that hold focus, read from the page. */
function focusedLine(): { readonly id: ItemId; readonly slot: number } | null {
  const active = typeof document === "undefined" ? null : document.activeElement;
  const row = active?.closest<HTMLElement>('[data-testid^="line-"]');
  const id = row?.dataset.testid?.slice("line-".length);
  return active && row && id ? { id: id as ItemId, slot: Math.max([...row.querySelectorAll("[data-pressable]")].indexOf(active), 0) } : null;
}

/** A claim that moves the focused line out of the filter remounts that line as a collapsing, inert copy, so focus falls to the page. It moves instead to the same control on the next line shown, else the one before, else the filter itself. The last focused line is tracked as focus moves, since the commit has replaced it by the time an effect runs. */
function useFocusKept(rows: readonly ReceiptRow[], filter: ItemFilter) {
  const shown = useMemo(() => lineIds(rows), [rows]);
  const last = useRef({ shown, filter });
  const held = useRef<ReturnType<typeof focusedLine>>(null);
  useEffect(() => {
    const track = () => {
      held.current = focusedLine();
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, []);
  useLayoutEffect(() => {
    const was = last.current;
    last.current = { shown, filter };
    const line = held.current;
    if (filter === "all" || was.filter !== filter || was.shown === shown || !line || shown.includes(line.id) || !was.shown.includes(line.id)) return;
    if (document.activeElement !== document.body && document.activeElement !== null) return;
    const at = was.shown.indexOf(line.id);
    const near = [...was.shown.slice(at + 1), ...was.shown.slice(0, at).reverse()].filter((one) => shown.includes(one));
    const target =
      near.map((one) => document.querySelectorAll<HTMLElement>(`[data-testid="line-${one}"] [data-pressable]`)[line.slot]).find(Boolean) ??
      document.querySelector<HTMLElement>('[data-testid="filter-tabs"] [aria-pressed="true"]') ??
      document.querySelector<HTMLElement>('[data-testid="filter-button"]')?.closest<HTMLElement>("[data-pressable]");
    target?.focus({ preventScroll: true });
  }, [shown, filter]);
}

type BundleProps = {
  bundle: BundleRow;
  open: boolean;
  claimed: number;
  claimers: readonly Participant[];
  who: Who;
  onToggle: () => void;
  children: ReactNode;
};

function inside(claimers: readonly Participant[], claimed: number): string {
  const had = claimers.length > 0 ? say.hadBy(claimers.map(({ name }) => name).join(", ")) : "";
  return [had, claimed > 0 ? say.claimedItems(claimed) : ""].filter(Boolean).join(", ");
}

function BundleGroup({ bundle, open, claimed, claimers, who, onToggle, children }: BundleProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const region = useId();
  const showInside = !open && claimers.length > 0;
  // The line grows in when a claim brings it and collapses out when a claim removes it, so the rows under it glide; opening or closing the Bundle already moves them.
  const [was, setWas] = useState({ open, showInside });
  const [byClaim, setByClaim] = useState(false);
  if (was.open !== open || was.showInside !== showInside) {
    setWas({ open, showInside });
    setByClaim(was.open === open);
  }
  return (
    <View role="listitem" testID={`bundle-${bundle.id}`}>
      <View pointerEvents="none" style={[styles.rule, fade, { backgroundColor: c.hairline, opacity: open ? 1 : 0 }]} />
      <PressTarget
        name={say.bundleLabel(bundle.name, bundle.summary, inside(claimers, claimed), open)}
        expanded={open}
        controls={region}
        onPress={onToggle}
        style={(pressed) => [styles.header, { borderTopColor: c.hairline }, pressStyle(pressed, reduce)]}
      >
        {() => (
          <>
            <View style={styles.bundleTop}>
              <View style={[styles.chevron, { transform: [{ translateX: open ? 0 : -chevronTip }, { rotate: open ? "0deg" : "-90deg" }] }, !reduce && turn]}>
                <Icon name="chevron" size={chevronSize} color={c.muted} />
              </View>
              <View style={styles.name}>
                <Text numberOfLines={1} style={[type.body, styles.nameText, { color: c.ink }]}>
                  {bundle.name}
                </Text>
                <Text numberOfLines={1} style={[type.caption, styles.noteText, { color: c.muted }]}>
                  {bundle.summary}
                </Text>
              </View>
              <Text style={[type.body, styles.nameText, tabular, { color: c.ink }]}>{money(bundle.net)}</Text>
            </View>
            <Presence present={showInside} animate={byClaim}>
              <View style={styles.bundleWho}>
                <WhoLine who={who} style={styles.name} />
                <Text style={[type.caption, tabular, styles.noteText, { color: c.muted }]}>{say.claimedItems(claimed)}</Text>
              </View>
            </Presence>
          </>
        )}
      </PressTarget>
      <Collapse open={open} id={region} label={bundle.name}>
        {children}
      </Collapse>
    </View>
  );
}

const collapseFor = 250;

// A grid-template-rows transition from 0fr to 1fr reaches the content's own height with no measuring and no script per frame, and a second tap mid-flight retargets from where it is.
function Collapse({ open, id, label, children }: { open: boolean; id: string; label: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(open);
  const outer = useRef<View>(null);
  const first = useRef(true);
  if (open && !shown) setShown(true);

  useLayoutEffect(() => {
    const box = outer.current as unknown as HTMLElement | null;
    if (!box) return;
    if (first.current) {
      first.current = false;
      Object.assign(box.style, { display: "grid", gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? "" : "0" });
      return;
    }
    const ms = reduce ? motion.reducedFade : collapseFor;
    const ease = `${ms}ms ${motion.easeOut}`;
    box.style.transition = reduce ? `opacity ${ease}` : `grid-template-rows ${ease}, opacity ${ease}`;
    if (open && reduce) box.style.gridTemplateRows = "1fr";
    // Rows mounted in this commit take the closed state first, so the first painted frame is still closed.
    box.getBoundingClientRect();
    box.style.opacity = open ? "1" : "0";
    if (!reduce) box.style.gridTemplateRows = open ? "1fr" : "0fr";
    const done = setTimeout(() => {
      if (open) return void (box.style.opacity = "");
      box.style.gridTemplateRows = "0fr";
      setShown(false);
    }, ms);
    return () => clearTimeout(done);
  }, [open, reduce]);

  return (
    <View ref={outer} nativeID={id} style={styles.collapse}>
      {shown ? (
        <View role="list" aria-label={label} style={styles.collapsed}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

type LineProps = {
  item: SplitItem;
  viewing: Viewing;
  portions: Portions;
  claimers: readonly Participant[];
  selected: Participant | null;
  inBundle: boolean;
  wide: boolean;
  whoColumn: boolean;
  /** The price column's width in the who-column layout, the same on every line so the who column stays straight. */
  priceWidth: number;
  onCircle: (item: SplitItem, press: Press) => void;
  onOpen: (item: SplitItem, press: Press) => void;
  expanded: boolean;
};

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** A line draws from its Item, who is looking and the viewer's portion. Its claimers come from those, so a Split that arrives with the same values skips the render. */
function sameLine(a: LineProps, b: LineProps): boolean {
  return (
    a.inBundle === b.inBundle &&
    a.wide === b.wide &&
    a.whoColumn === b.whoColumn &&
    a.priceWidth === b.priceWidth &&
    a.expanded === b.expanded &&
    a.onCircle === b.onCircle &&
    a.onOpen === b.onOpen &&
    a.selected?.id === b.selected?.id &&
    a.selected?.name === b.selected?.name &&
    a.viewing.me === b.viewing.me &&
    a.viewing.viewer === b.viewing.viewer &&
    a.portions.get(a.item.id) === b.portions.get(b.item.id) &&
    sameJson(a.viewing.people, b.viewing.people) &&
    sameJson(a.item, b.item)
  );
}

/** Who had it, in muted ink except "You", which takes the strong ink so the viewer's own lines stand apart from the details above. */
function WhoLine({ who, style }: { who: Who; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return (
    <Text numberOfLines={2} style={[type.caption, styles.noteText, { color: c.muted }, style]}>
      {who.you ? (
        <>
          <Text style={{ color: c.ink }}>{say.youHad}</Text>
          {who.others.map((name) => `, ${name}`).join("")}
        </>
      ) : (
        whoText(who)
      )}
    </Text>
  );
}

/** A dot that claims the line, and the rest of the row, which opens it. The left column is the name, the detail and who had it; the right is the full price and what it comes to for the viewer or each person. */
const Line = memo(function Line({ item, viewing, portions, claimers, selected, inBundle, wide, whoColumn, priceWidth, onCircle, onOpen, expanded }: LineProps) {
  const c = useColors();
  const mine = selected !== null && claimers.some(({ id }) => id === selected.id);
  // Once someone is shown, the rows they didn't have step back to the muted ink, and come forward under a mouse.
  const quiet = selected !== null && !mine;
  const big = wide ? styles.wideFigure : styles.figure;
  const price = groupedAmount(item.price);
  const [title, detail] = nameParts(item);
  const count = quantityText(item);
  const label = count ? `${count} ${item.name}` : item.name;
  const { who, split } = lineView(item, viewing, portions);
  return (
    <View role="listitem" testID={`line-${item.id}`} style={[styles.line, { borderTopColor: c.hairline }, inBundle && { marginLeft: nameStart }]}>
      <PressTarget
        name={selected ? say.claimFor(label, selected.name) : say.whoHad(label)}
        toggled={selected ? mine : undefined}
        onPress={(press) => onCircle(item, press)}
        style={() => styles.circle}
      >
        {(pressed) => <ClaimDot on={mine} pressed={pressed} />}
      </PressTarget>
      <PressTarget name={[say.open(label), `$${price}`, whoText(who), split].filter(Boolean).join(", ")} popup="dialog" expanded={expanded} onPress={(press) => onOpen(item, press)} style={(pressed) => [styles.body, pressed ? rowFade : fade, pressed && styles.held]}>
        {(_, hovered) => (
          <>
            <View style={styles.name}>
              <Text numberOfLines={2} style={[big, inkFade, { color: quiet && !hovered ? c.muted : c.ink }]}>
                {count ? <Text style={[type.caption, tabular, { color: c.muted }]}>{`${count}  `}</Text> : null}
                {title}
              </Text>
              {detail ? (
                <Text numberOfLines={2} style={[type.caption, styles.noteText, { color: c.muted }]}>
                  {detail}
                </Text>
              ) : null}
              {whoColumn ? null : <WhoLine who={who} />}
            </View>
            {whoColumn ? <WhoLine who={who} style={styles.whoColumn} /> : null}
            <View style={[styles.figures, whoColumn && { minWidth: priceWidth }]}>
              <Text style={[big, tabular, inkFade, { color: quiet && !hovered ? c.muted : c.ink }]}>{money(item.price)}</Text>
              {split ? (
                <Text numberOfLines={1} style={[type.caption, styles.noteText, tabular, { color: c.muted }]}>
                  {split}
                </Text>
              ) : null}
            </View>
          </>
        )}
      </PressTarget>
    </View>
  );
}, sameLine);

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.row}>
      <RowFace label={label} amount={amount} />
    </View>
  );
}

function RowFace({ label, amount }: { label: string; amount: number }) {
  const c = useColors();
  return (
    <>
      <Text numberOfLines={1} style={[styles.chargeText, styles.rowLabel, { color: c.muted }]}>
        {label}
      </Text>
      <Text style={[styles.chargeText, tabular, { color: c.muted }]}>{money(amount)}</Text>
    </>
  );
}

const turn = webStyle({ transitionProperty: "transform", transitionDuration: "200ms", transitionTimingFunction: motion.easeOut });
const fade = webStyle({ transitionProperty: "opacity", transitionDuration: "200ms", transitionTimingFunction: motion.easeOut });
/** A pressed row dims in 100 ms so a quick tap reaches it, and eases back over `fade`'s 200 ms. */
const rowFade = webStyle({ transitionProperty: "opacity", transitionDuration: "100ms", transitionTimingFunction: motion.easeOut });
/** A row's name and price change ink when it is claimed or hovered, quickly enough to follow the pointer down the list. */
const inkFade = webStyle({ transitionProperty: "color", transitionDuration: "150ms", transitionTimingFunction: "ease" });

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 12, marginBottom: 2 },
  itemsHead: { flexShrink: 1 },
  tabsLine: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginTop: 4, marginBottom: 6 },
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
  caps: { fontFamily: type.caption.fontFamily, fontSize: 11, lineHeight: 22, letterSpacing: 1, textTransform: "uppercase", fontWeight: "500", paddingBottom: 9 },
  empty: { paddingVertical: 20, paddingLeft: nameStart, borderTopWidth: 1 },
  list: { borderBottomWidth: 1 },
  // The dot, the name and the price are each centred on the row, so they stay level however many lines the name runs to.
  line: { flexDirection: "row", alignItems: "center", borderTopWidth: 1 },
  // The dot's 16 px slot sits in the middle of its 44 px hit area, which bleeds past the gutter.
  circle: { width: dotTap, height: dotTap, justifyContent: "center", marginLeft: -dotBleed, marginRight: -4, paddingLeft: dotBleed },
  body: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", columnGap, paddingTop: 15, paddingBottom: 14 },
  held: { opacity: 0.55 },
  name: { flex: 1, minWidth: 0 },
  nameText: { lineHeight: nameLine },
  noteText: { lineHeight: noteLine },
  figures: { flexShrink: 0, alignItems: "flex-end" },
  figure: { fontFamily: type.body.fontFamily, fontWeight: "500", fontSize: 18, lineHeight: nameLine, letterSpacing: -0.2 },
  wideFigure: { fontFamily: type.body.fontFamily, fontWeight: "500", fontSize: 21, lineHeight: 28, letterSpacing: -0.3 },
  // Small caps in their own column, centred on the row like the name and the price.
  whoColumn: { width: 150, fontSize: 11, lineHeight: 22, letterSpacing: 1, textTransform: "uppercase", fontWeight: "500" },
  header: { borderTopWidth: 1, paddingVertical: 12 },
  bundleTop: { flexDirection: "row", alignItems: "flex-start", columnGap },
  bundleWho: { flexDirection: "row", marginLeft: nameStart, columnGap },
  chevron: { width: nameStart - columnGap, height: nameLine, alignItems: "center", justifyContent: "center" },
  // The vertical rule runs from the open chevron's tip down beside the children; the chevron sits at the centre of its slot.
  rule: { position: "absolute", left: (nameStart - columnGap) / 2 - 0.5, width: 1, top: 12 + nameLine / 2 + 4, bottom: 0 },
  collapse: { overflow: "hidden", marginHorizontal: -bleed, paddingHorizontal: bleed },
  collapsed: { minHeight: 0 },
  discount: { flexDirection: "row", alignItems: "center", columnGap, minHeight: 44, marginLeft: nameStart, paddingLeft: nameStart, borderTopWidth: 1 },
  charges: { marginTop: 14, paddingLeft: nameStart },
  why: { marginTop: 2, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: chargeRow, gap: 12 },
  // A 44 px tap target that still sits on the row pitch; the overlap goes to the later row.
  tapRow: { minHeight: dotTap, marginVertical: (chargeRow - dotTap) / 2 },
  chargeText: { fontFamily: type.body.fontFamily, fontSize: 15, lineHeight: 24, letterSpacing: -0.1 },
  rowLabel: { flexShrink: 1 },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 10, paddingTop: 12, paddingLeft: nameStart, borderTopWidth: 1 },
  unclaimed: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: nameStart, marginTop: 10 },
});
