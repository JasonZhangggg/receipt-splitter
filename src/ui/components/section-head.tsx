import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { tabular, type, useColors } from "../theme";

type Props = {
  label: string;
  /** Gray right after the label, like Edit item's " · $15.99". */
  note?: string | null;
  /** Gray beside the label, like "2 items" or "$41.22 left". */
  detail?: string | null;
  /** On the right instead of the detail, like Edit item's Evenly link. */
  children?: ReactNode;
  /** The hairline under it. Off where the first row below draws its own rule. */
  rule?: boolean;
};

/** The heading over a group of rows in every sheet and in the column: the label in ink at body size, its detail in gray, and a hairline under it. "What you had" set the look. */
export function SectionHead({ label, note = null, detail = null, children, rule = true }: Props) {
  const c = useColors();
  return (
    <View style={[styles.head, rule && [styles.rule, { borderBottomColor: c.hairline }]]}>
      <Text role="heading" aria-level={3} numberOfLines={1} style={[type.body, styles.label, { color: c.ink }]}>
        {label}
        {note ? <Text style={[type.caption, tabular, { color: c.muted }]}>{note}</Text> : null}
      </Text>
      {detail ? <Text style={[type.caption, tabular, { color: c.muted }]}>{detail}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  rule: { paddingBottom: 12, borderBottomWidth: 1 },
  label: { flexShrink: 1, minWidth: 0 },
});
