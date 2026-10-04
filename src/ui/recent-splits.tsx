import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RecentSplit } from "../device";
import { scrollViewTouchDelay } from "./components/button";
import { historyCopy as say } from "./home-copy";
import { webStyle } from "./motion";
import { dollars } from "./pay/model";
import { motion, type, useColors } from "./theme";

type Props = { splits: readonly RecentSplit[]; now: number };

const tabular = { fontVariant: ["tabular-nums" as const] };
/** A row in the scrolling page fills only once a touch holds, so a scroll that starts on it does not flash. */
const web = { dataSet: { pressable: "" }, delayPressIn: scrollViewTouchDelay };
const fillIn = webStyle({ transitionProperty: "background-color", transitionDuration: "0ms" });
const fillOut = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.pressOut}ms`, transitionTimingFunction: motion.easeOut });

export function RecentSplits({ splits, now }: Props) {
  const c = useColors();
  return (
    <View role="region" aria-label={say.title} style={styles.list}>
      <Text role="heading" aria-level={2} style={[type.small, styles.title, { color: c.muted }]}>
        {say.title}
      </Text>
      {splits.map(({ id, names, total, added }) => {
        const who = say.names(names);
        const when = say.when(added, now);
        const amount = dollars(total);
        return (
          <Link key={id} href={`/s/${id}`} asChild>
            <Pressable {...web} aria-label={say.row(who, when, amount)}>
              {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => (
                <View style={[styles.row, pressed || hovered ? [fillIn, { backgroundColor: c.sheetIn }] : fillOut]}>
                  <View style={styles.text}>
                    <Text numberOfLines={1} style={[type.label, { color: c.ink }]}>
                      {who}
                    </Text>
                    <Text style={[type.small, { color: c.muted }]}>{when}</Text>
                  </View>
                  <Text style={[type.label, tabular, { color: c.ink }]}>{amount}</Text>
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
  list: { alignSelf: "stretch", gap: 2 },
  title: { paddingHorizontal: 12, paddingBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  text: { flex: 1, minWidth: 0 },
});
