import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RecentSplit } from "../device";
import { money } from "../draft";
import { scrollViewTouchDelay } from "./components/button";
import { historyCopy as say } from "./home-copy";
import { webStyle } from "./motion";
import { motion, tabular, type, useColors } from "./theme";

/** A row in a scrolling list fills only once a touch holds, so a scroll that starts on it does not flash. */
const web = { dataSet: { pressable: "" }, delayPressIn: scrollViewTouchDelay };
const fillIn = webStyle({ transitionProperty: "background-color", transitionDuration: "0ms" });
const fillOut = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.pressOut}ms`, transitionTimingFunction: motion.easeOut });

/** The space between the sentence block and the list. */
export const recentGap = 32;

/** The Splits this device stored, newest first, under the sentence. Each row shows only what the device keeps: who, when, how many, the total. */
export function RecentSplits({ splits, now }: { splits: readonly RecentSplit[]; now: number }) {
  const c = useColors();
  return (
    <View role="region" aria-label={say.title} style={styles.section}>
      <Text role="heading" aria-level={2} style={[type.caption, styles.title, { color: c.muted, borderBottomColor: c.hairline }]}>
        {say.title}
      </Text>
      {splits.map(({ id, names, total, added }) => {
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: recentGap },
  title: { paddingBottom: 10, borderBottomWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  text: { flex: 1, minWidth: 0 },
});
