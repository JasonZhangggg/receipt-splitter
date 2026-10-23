import { StyleSheet, Text, View } from "react-native";

import { money } from "../../draft";
import { useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { motion, type, useColors } from "../theme";
import type { BillParts } from "./model";

type Props = BillParts & {
  /** "You", or the viewed person's first name, for the legend. With none, no legend shows. */
  legend?: string;
};

/** The bill as one thin bar: the viewed share in ink, everyone else's in gray, and the unclaimed rest as the bare track. */
export function ShareBar({ mine, others, unclaimed, legend }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const total = Math.max(mine + others + unclaimed, 1);
  const part = (cents: number) => `${(cents / total) * 100}%` as const;
  return (
    <View>
      <View testID="share-bar" role="img" aria-label={say.billPart(Math.round((mine / total) * 100))} style={[styles.track, { backgroundColor: c.off }]}>
        <View style={[styles.part, styles.mine, !reduce && grow, { width: part(mine), backgroundColor: c.ink }]} />
        <View style={[styles.part, !reduce && grow, mine > 0 && others > 0 && styles.gap, { width: part(others), backgroundColor: c.dash }]} />
      </View>
      {legend ? (
        <View style={styles.legend}>
          <Key color={c.ink} label={legend} />
          <Key color={c.dash} label={say.everyoneElse} />
          {unclaimed > 0 ? <Key color={c.off} label={`${say.unclaimed} ${money(unclaimed)}`} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  const c = useColors();
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[type.caption, styles.keyText, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

/** A claim slides the bar's parts to their new lengths. Width on a 6 px bar in a fixed footer lays out nothing else, so it costs less than it would elsewhere. */
const grow = webStyle({ transitionProperty: "width", transitionDuration: "250ms", transitionTimingFunction: motion.easeOut });

const styles = StyleSheet.create({
  track: { flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden" },
  part: { height: "100%" },
  mine: { borderTopLeftRadius: 3, borderBottomLeftRadius: 3 },
  gap: { marginLeft: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4, marginTop: 10 },
  key: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  keyText: { fontSize: 13, lineHeight: 18 },
});
