import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RecentSplit } from "../device";
import { money } from "../draft";
import { scrollViewTouchDelay, useHeld, type Press } from "./components/button";
import { TextLink } from "./components/text-link";
import { historyCopy as say } from "./home-copy";
import { rowsThatFit } from "./recent-fit";
import { webStyle } from "./motion";
import { SheetHeader } from "./split-view/sheet-header";
import { motion, tabular, type, useColors } from "./theme";

/** A row in a scrolling list fills only once a touch holds, so a scroll that starts on it does not flash. */
const web = { dataSet: { pressable: "" }, delayPressIn: scrollViewTouchDelay };
const headPad = 12;
// Without it the rows would size the section, and the page would grow to fit them instead of the section shrinking to fit the page.
const noIntrinsicHeight = webStyle({ contain: "size" } as never);
const fillIn = webStyle({ transitionProperty: "background-color", transitionDuration: "0ms" });
const fillOut = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.pressOut}ms`, transitionTimingFunction: motion.easeOut });

// Every row is a line of names over a line of when and who, so each is as tall as the next: its padding, the two lines and the rule. See all sits in the heading, so it takes no room of its own.
const sizes = { title: headPad + type.body.lineHeight + 1, row: 14 * 2 + type.body.lineHeight + type.caption.lineHeight + 1, seeAll: 0 };

type Props = {
  splits: readonly RecentSplit[];
  now: number;
  onSeeAll: (press: Press) => void;
  /** In the wide layout's column, which places it, rather than under the sentence. */
  wide?: boolean;
};

/** The Splits this device stored, newest first, under the sentence: as many as fit in the height the section takes, then See all for the rest. */
export function RecentSplits({ splits, now, onSeeAll, wide = false }: Props) {
  const c = useColors();
  const [room, setRoom] = useState<number | null>(null);
  const shown = room === null ? null : rowsThatFit(splits.length, room, sizes);
  return (
    // The section takes the height the sentence leaves, so its own size says how many rows fit and changes whenever the sentence does. Hidden for the frame before it is measured, so the list never shows more rows than fit and then drops them.
    <View role="region" aria-label={say.title} onLayout={({ nativeEvent }) => setRoom(nativeEvent.layout.height)} style={[styles.section, wide && styles.inColumn, noIntrinsicHeight, shown === null && styles.measuring]}>
      <View style={styles.clip}>
        {/* The Split page's section heading: the label in ink at body size over a hairline, See all at its end in gray. */}
        <View style={[styles.head, { borderBottomColor: c.hairline }]}>
          <Text role="heading" aria-level={2} style={[type.body, { color: c.ink }]}>
            {say.title}
          </Text>
          {shown !== null && shown < splits.length ? (
            <View style={styles.seeAll}>
              <TextLink body label={say.seeAll(splits.length)} onPress={onSeeAll} popup="dialog" />
            </View>
          ) : null}
        </View>
        <Rows splits={splits.slice(0, shown ?? 0)} now={now} />
      </View>
    </View>
  );
}

/** Every stored Split, in a sheet that scrolls. */
export function RecentSheet({ splits, now, onClose }: { splits: readonly RecentSplit[]; now: number; onClose: () => void }) {
  return (
    <>
      <SheetHeader title={say.title} onClose={onClose} />
      <View style={styles.sheetRows}>
        <Rows splits={splits} now={now} />
      </View>
    </>
  );
}

/** Each row shows only what the device keeps: who, when, how many, the total. */
function Rows({ splits, now }: { splits: readonly RecentSplit[]; now: number }) {
  return splits.map((split) => <HistoryRow key={split.id} split={split} now={now} />);
}

function HistoryRow({ split: { id, names, you, place, total, added }, now }: { split: RecentSplit; now: number }) {
  const c = useColors();
  const { held, press, release } = useHeld();
  const who = say.names(names);
  const when = say.when(added, now);
  const people = say.people(names.length);
  const amount = money(total);
  const lines = say.lines(place, who, when, people);
  // The first name is the Host's, who paid the bill.
  const payer = say.paid(you === 0 ? null : (names[0]?.trim().split(/\s+/)[0] ?? ""));
  return (
    <Link href={`/s/${id}`} asChild>
      <Pressable {...web} onPressIn={press} onPressOut={release} aria-label={say.row(who, when, people, amount, place, payer)} style={{ borderBottomWidth: 1, borderBottomColor: c.hairline }}>
        {({ hovered }: { pressed: boolean; hovered?: boolean }) => (
          <View style={[styles.row, held || hovered ? [fillIn, { backgroundColor: c.hairline }] : fillOut]}>
            <View style={styles.text}>
              <Text numberOfLines={1} style={[type.body, styles.strong, { color: c.ink }]}>
                {lines.first}
              </Text>
              <Text numberOfLines={1} style={[type.caption, { color: c.muted }]}>
                {lines.second}
              </Text>
            </View>
            <View style={styles.end}>
              <Text style={[type.body, styles.strong, tabular, { color: c.ink }]}>{amount}</Text>
              <Text numberOfLines={1} style={[type.caption, { color: c.muted }]}>
                {payer}
              </Text>
            </View>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  // Its height is what the sentence leaves, but never less than the heading and See all.
  section: { marginTop: 44, flex: 1, minHeight: sizes.title + sizes.seeAll },
  // The clip pads 12 px each side and pulls back by the same, so it leaves room for the rows' fill and the link's focus ring while the text keeps the column's edge.
  clip: { flex: 1, marginHorizontal: -12, paddingHorizontal: 12, overflow: "hidden" },
  inColumn: { marginTop: 0 },
  measuring: { opacity: 0 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: type.body.lineHeight, paddingBottom: headPad, borderBottomWidth: 1 },
  // Names and amounts are the Split page's rows: 18 px at weight 500 on the same 24 px line.
  strong: { fontSize: 18, fontWeight: "500", letterSpacing: -0.2 },
  // The link keeps its 44 px tap area without making the heading taller than its line.
  seeAll: { marginVertical: -10 },
  end: { alignItems: "flex-end", maxWidth: "45%" },
  // The fill reaches 12 px past the text on each side, so the text sits inside it.
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 12 },
  text: { flex: 1, minWidth: 0 },
  sheetRows: { marginTop: 8 },
});
