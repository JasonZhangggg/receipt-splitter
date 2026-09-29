import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from "react-native";

import { copy, money, sample } from "./sample";
import { ease, enter, press, setPageColor, useReducedMotion, focusRing } from "./web";

const palettes = {
  light: {
    bg: "#F2F1ED",
    card: "#FFFFFF",
    label: "#141413",
    secondary: "#5E5D58",
    separator: "#E2E0DA",
    tint: "#0A6B48",
    onTint: "#FFFFFF",
    warnBg: "#FFF1CC",
    warnText: "#6A4300",
    warnMark: "#D08A00",
    bar: "rgba(242, 241, 237, 0.78)",
    barEdge: "rgba(0, 0, 0, 0.08)",
  },
  dark: {
    bg: "#0B0B0A",
    card: "#1B1B19",
    label: "#F2F1ED",
    secondary: "#A4A39D",
    separator: "#2E2D2A",
    tint: "#4CCB8E",
    onTint: "#062414",
    warnBg: "#3A2B08",
    warnText: "#FFD27A",
    warnMark: "#F0A92A",
    bar: "rgba(11, 11, 10, 0.72)",
    barEdge: "rgba(255, 255, 255, 0.08)",
  },
};

const sans = "Atkinson, system-ui, -apple-system, sans-serif";

export function Native() {
  const c = palettes[useColorScheme() === "dark" ? "dark" : "light"];
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  useEffect(() => setPageColor(c.bg), [c.bg]);

  const action = (
    <View style={wide ? styles.inlineAction : null}>
      <Pressable
        role="button"
        aria-label={copy.scan}
        {...focusRing}
        style={({ pressed }) => [
          styles.button,
          press(),
          { backgroundColor: c.tint },
          pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
        ]}
      >
        <Text style={[styles.buttonText, { color: c.onTint }]}>{copy.scan}</Text>
      </Pressable>
      <Text style={[styles.footnote, styles.center, { color: c.secondary }]}>{copy.privacy}</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]}>
        <View style={enter(reduce, { duration: 280, from: "translateY(6px)" })}>
          <Text style={[styles.wordmark, { color: c.tint }]}>Receipt Splitter</Text>
          <Text style={[styles.largeTitle, { color: c.label }]} role="heading" aria-level={1}>
            Split the bill from a photo
          </Text>
          <Text style={[styles.body, { color: c.secondary }]}>{copy.pitch}</Text>
        </View>

        {wide ? action : null}

        <View style={enter(reduce, { delay: 80, duration: 420, from: "translateY(24px)", easing: ease.drawer })}>
          <Text style={[styles.sectionHeader, { color: c.secondary }]}>{copy.sampleLabel.toUpperCase()}</Text>
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.headline, { color: c.label }]}>{sample.merchant}</Text>
              <Text style={[styles.footnote, { color: c.secondary }]}>{sample.detail}</Text>
            </View>
            {sample.items.map((item) => (
              <View key={item.id}>
                <View style={[styles.separator, { backgroundColor: c.separator }]} />
                <View style={[styles.row, item.flagged && { backgroundColor: c.warnBg }]}>
                  {item.flagged ? <View style={[styles.warnMark, { backgroundColor: c.warnMark }]} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.body, { color: item.flagged ? c.warnText : c.label }]}>{item.name}</Text>
                    {item.flagged ? (
                      <Text style={[styles.footnote, { color: c.warnText }]}>{copy.fix}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.body, styles.num, { color: item.flagged ? c.warnText : c.label }]}>
                    {money(item.cents)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.card, styles.cardGap, { backgroundColor: c.card }]}>
            {[
              ["Subtotal", sample.subtotal],
              ["Tax", sample.tax],
              ["Tip, 20%", sample.tip],
            ].map(([label, cents], i) => (
              <View key={label}>
                {i > 0 ? <View style={[styles.separator, { backgroundColor: c.separator }]} /> : null}
                <View style={styles.row}>
                  <Text style={[styles.body, { flex: 1, color: c.secondary }]}>{label}</Text>
                  <Text style={[styles.body, styles.num, { color: c.secondary }]}>{money(cents as number)}</Text>
                </View>
              </View>
            ))}
            <View style={[styles.separator, { backgroundColor: c.separator }]} />
            <View style={styles.row}>
              <Text style={[styles.headline, { flex: 1, color: c.label }]}>Total</Text>
              <Text style={[styles.headline, styles.num, { color: c.label }]}>{money(sample.total)}</Text>
            </View>
          </View>
          <Text style={[styles.footnote, styles.sectionFooter, { color: c.warnText }]}>{copy.short}</Text>
        </View>
      </ScrollView>

      {wide ? null : (
        <View style={[styles.bar, { backgroundColor: c.bar, borderTopColor: c.barEdge }]}>{action}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 160, gap: 28 },
  contentWide: { width: "100%", maxWidth: 600, alignSelf: "center", paddingTop: 72, paddingBottom: 72 },
  wordmark: { fontFamily: sans, fontWeight: "700", fontSize: 15, letterSpacing: 0.2, marginBottom: 10 },
  largeTitle: { fontFamily: sans, fontWeight: "700", fontSize: 34, lineHeight: 40, letterSpacing: -0.6, marginBottom: 10 },
  body: { fontFamily: sans, fontSize: 17, lineHeight: 24 },
  headline: { fontFamily: sans, fontWeight: "700", fontSize: 17, lineHeight: 24 },
  footnote: { fontFamily: sans, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  num: { fontVariant: ["tabular-nums"], marginLeft: 12 },
  center: { textAlign: "center", marginTop: 10 },
  sectionHeader: { fontFamily: sans, fontSize: 13, letterSpacing: 0.4, marginLeft: 16, marginBottom: 8 },
  sectionFooter: { marginHorizontal: 16, marginTop: 8 },
  card: { borderRadius: 12, overflow: "hidden" },
  cardGap: { marginTop: 16 },
  cardHead: { paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 16, paddingVertical: 10 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  warnMark: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  inlineAction: { maxWidth: 360 },
  button: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: sans, fontWeight: "700", fontSize: 17 },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    backdropFilter: "blur(20px) saturate(180%)",
  } as object,
});
