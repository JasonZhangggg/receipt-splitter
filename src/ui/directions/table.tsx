import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from "react-native";

import { copy, money, sample } from "./sample";
import { enter, press, setPageColor, useReducedMotion, focusRing } from "./web";

const palettes = {
  light: {
    field: "#FF5B2E",
    onField: "#17110E",
    fieldMuted: "#4A1D0E",
    paper: "#FAF7F2",
    ink: "#17110E",
    muted: "#6B625B",
    rule: "#17110E",
    hairline: "#DDD5CC",
    flag: "#B8330C",
    flagWash: "#FFE3D8",
    button: "#17110E",
    onButton: "#FAF7F2",
  },
  dark: {
    field: "#17110E",
    onField: "#FF6A3D",
    fieldMuted: "#C9B8AC",
    paper: "#221B17",
    ink: "#F6EFE8",
    muted: "#B3A79D",
    rule: "#F6EFE8",
    hairline: "#3A302A",
    flag: "#FF8A63",
    flagWash: "#3D2016",
    button: "#FF6A3D",
    onButton: "#17110E",
  },
};

const display = "ArchivoCondensed, Impact, sans-serif";
const text = "Archivo, system-ui, sans-serif";
const headline = ["Split the bill", "at the table."];

export function Table() {
  const c = palettes[useColorScheme() === "dark" ? "dark" : "light"];
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  useEffect(() => setPageColor(c.field), [c.field]);

  const field = (
    <View style={[styles.field, wide && styles.fieldWide, { backgroundColor: c.field }]}>
      <Text style={[styles.wordmark, { color: c.onField }]}>RECEIPT SPLITTER</Text>
      <View role="heading" aria-level={1} aria-label={headline.join(" ")}>
        {headline.map((line, i) => (
          <View key={line} style={styles.lineMask}>
            <Text
              style={[
                styles.display,
                wide && styles.displayWide,
                { color: c.onField },
                enter(reduce, { delay: 60 + i * 70, duration: 520, from: "translateY(100%)" }),
              ]}
            >
              {line}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.pitch, wide && styles.pitchWide, { color: c.onField }, enter(reduce, { delay: 220 })]}>
        {copy.pitch}
      </Text>
      <View style={[styles.actionRow, enter(reduce, { delay: 280 })]}>
        <Pressable
          role="button"
          aria-label={copy.scan}
          {...focusRing}
          style={({ pressed }) => [
            styles.button,
            press(120),
            { backgroundColor: c.button },
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          <Text style={[styles.buttonText, { color: c.onButton }]}>{copy.scan}</Text>
        </Pressable>
        <Text style={[styles.small, { color: c.fieldMuted }]}>{copy.privacy}</Text>
      </View>
    </View>
  );

  const receipt = (
    <View style={[styles.paper, wide && styles.paperWide, { backgroundColor: c.paper }]}>
      <Text style={[styles.kicker, { color: c.muted }]}>{copy.sampleLabel.toUpperCase()}</Text>
      <Text style={[styles.merchant, { color: c.ink }]}>{sample.merchant}</Text>
      <Text style={[styles.small, { color: c.muted }]}>{sample.detail}</Text>
      <View style={[styles.rule, { backgroundColor: c.rule }]} />
      {sample.items.map((item, i) => (
        <View
          key={item.id}
          style={[
            styles.row,
            { borderBottomColor: c.hairline },
            item.flagged && { backgroundColor: c.flagWash },
            enter(reduce, { delay: 320 + i * 40 }),
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.itemName, { color: item.flagged ? c.flag : c.ink }]}>{item.name}</Text>
            {item.flagged ? <Text style={[styles.small, { color: c.flag }]}>{copy.fix}</Text> : null}
          </View>
          <Text style={[styles.price, { color: item.flagged ? c.flag : c.ink }]}>{money(item.cents)}</Text>
        </View>
      ))}
      {[
        ["Subtotal", sample.subtotal],
        ["Tax", sample.tax],
        ["Tip 20%", sample.tip],
      ].map(([label, cents]) => (
        <View key={label} style={styles.adjRow}>
          <Text style={[styles.adj, { color: c.muted }]}>{label}</Text>
          <Text style={[styles.adj, styles.num, { color: c.muted }]}>{money(cents as number)}</Text>
        </View>
      ))}
      <View style={[styles.rule, { backgroundColor: c.rule }]} />
      <View style={styles.totalRow}>
        <Text style={[styles.totalLabel, { color: c.ink }]}>Total</Text>
        <Text style={[styles.totalValue, { color: c.ink }]}>{money(sample.total)}</Text>
      </View>
      <Text style={[styles.small, styles.status, { color: c.flag }]}>{copy.short}</Text>
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: c.paper }}
      contentContainerStyle={wide ? styles.split : null}
    >
      {field}
      {receipt}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: "row", minHeight: "100%" },
  field: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36 },
  fieldWide: { flex: 1.2, paddingHorizontal: 64, paddingTop: 64, justifyContent: "space-between" },
  wordmark: { fontFamily: text, fontWeight: "500", fontSize: 13, letterSpacing: 2.4, marginBottom: 28 },
  lineMask: { overflow: "hidden" },
  display: { fontFamily: display, fontWeight: "800", fontSize: 64, lineHeight: 62, letterSpacing: -0.5 },
  displayWide: { fontSize: 92, lineHeight: 88, letterSpacing: -1 },
  pitch: { fontFamily: text, fontWeight: "500", fontSize: 18, lineHeight: 26, marginTop: 20, maxWidth: 440 },
  pitchWide: { fontSize: 21, lineHeight: 30 },
  actionRow: { marginTop: 28, gap: 12, alignItems: "flex-start" },
  button: { height: 56, paddingHorizontal: 28, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: text, fontWeight: "500", fontSize: 18, letterSpacing: 0.2 },
  small: { fontFamily: text, fontWeight: "500", fontSize: 14, lineHeight: 20 },
  paper: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48 },
  paperWide: { flex: 1, paddingHorizontal: 64, paddingTop: 64, maxWidth: 640 },
  kicker: { fontFamily: text, fontWeight: "500", fontSize: 12, letterSpacing: 2, marginBottom: 8 },
  merchant: { fontFamily: display, fontWeight: "800", fontSize: 40, lineHeight: 42 },
  rule: { height: 3, marginTop: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderBottomWidth: 1,
  },
  itemName: { fontFamily: text, fontWeight: "500", fontSize: 18, lineHeight: 24 },
  price: { fontFamily: display, fontWeight: "800", fontSize: 26, fontVariant: ["tabular-nums"], marginLeft: 12 },
  adjRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 10 },
  adj: { fontFamily: text, fontWeight: "500", fontSize: 16 },
  num: { fontVariant: ["tabular-nums"] },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 },
  totalLabel: { fontFamily: display, fontWeight: "800", fontSize: 32 },
  totalValue: { fontFamily: display, fontWeight: "800", fontSize: 48, fontVariant: ["tabular-nums"] },
  status: { marginTop: 12 },
});
