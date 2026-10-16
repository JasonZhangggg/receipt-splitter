import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RecentSplit } from "../device";
import { money } from "../draft";
import { scrollViewTouchDelay, type Press } from "./components/button";
import { TextLink } from "./components/text-link";
import { historyCopy as say } from "./home-copy";
import { rowsThatFit } from "./recent-fit";
import { webStyle } from "./motion";
import { SheetHeader } from "./split-view/sheet-header";
import { motion, tabular, type, useColors } from "./theme";

/** A row in a scrolling list fills only once a touch holds, so a scroll that starts on it does not flash. */
const web = { dataSet: { pressable: "" }, delayPressIn: scrollViewTouchDelay };
const fillIn = webStyle({ transitionProperty: "background-color", transitionDuration: "0ms" });
const fillOut = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.pressOut}ms`, transitionTimingFunction: motion.easeOut });

// Every row is one line of names over one line of when and who, so each is as tall as the next: its padding, the two lines and the rule.
const sizes = { title: type.caption.lineHeight + 10 + 1, row: 14 * 2 + type.body.lineHeight + type.caption.lineHeight + 1, seeAll: 44 };

type Props = {
  splits: readonly RecentSplit[];
  now: number;
  /** Where the page's column ends, in its own coordinates; the section fills what is left down to it. */
  end: number | null;
  onSeeAll: (press: Press) => void;
};

/** The Splits this device stored, newest first, under the sentence: as many as fit on the page, then See all for the rest. */
export function RecentSplits({ splits, now, end, onSeeAll }: Props) {
  const c = useColors();
  const [top, setTop] = useState<number | null>(null);
  const shown = top === null || end === null ? null : rowsThatFit(splits.length, end - top, sizes);
  return (
    // Hidden for the frame before it is measured, so the list never shows more rows than fit and then drops them.
    <View role="region" aria-label={say.title} onLayout={({ nativeEvent }) => setTop(nativeEvent.layout.y)} style={[styles.section, shown === null && styles.measuring]}>
      <Text role="heading" aria-level={2} style={[type.caption, styles.title, { color: c.muted, borderBottomColor: c.hairline }]}>
        {say.title}
      </Text>
      <Rows splits={splits.slice(0, shown ?? 0)} now={now} />
      {shown !== null && shown < splits.length ? <TextLink ink label={say.seeAll(splits.length)} onPress={onSeeAll} popup="dialog" /> : null}
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
  const c = useColors();
  return splits.map(({ id, names, total, added }) => {
    const who = say.names(names);
    const when = say.when(added, now);
    const people = say.people(names.length);
    const amount = money(total);
    return (
      <Link key={id} href={`/s/${id}`} asChild>
        <Pressable {...web} aria-label={say.row(who, when, people, amount)}>
          {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
            <View style={[styles.row, { borderBottomColor: c.hairline }, pressed || hovered ? [fillIn, { backgroundColor: c.sheetIn }] : fillOut]}>
              <View style={styles.text}>
                <Text numberOfLines={1} style={[type.body, { color: c.ink }]}>
                  {who}
                </Text>
                <Text numberOfLines={1} style={[type.caption, { color: c.muted }]}>
                  {say.meta(when, people)}
                </Text>
              </View>
              <Text style={[type.body, tabular, { color: c.ink }]}>{amount}</Text>
            </View>
          )}
        </Pressable>
      </Link>
    );
  });
}

const styles = StyleSheet.create({
  section: { marginTop: 44 },
  measuring: { opacity: 0 },
  title: { paddingBottom: 10, borderBottomWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  text: { flex: 1, minWidth: 0 },
  sheetRows: { marginTop: 8 },
});
