import { router } from "expo-router";
import { useEffect } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, type TextStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressTarget } from "../src/ui/components/button";
import { Icon } from "../src/ui/components/icon";
import { Toast } from "../src/ui/components/toast";
import { useLayoutWidth } from "../src/ui/components/viewport";
import { howCopy as say } from "../src/ui/how-it-works-copy";
import { pressStyle, pressFeel, useReducedMotion } from "../src/ui/motion";
import { SplitHeader, useSiteShare } from "../src/ui/split-view/header";
import { breakpoints, layout, type, useColors } from "../src/ui/theme";

/**
 * How it works inside the app, so the header's "?" opens it without loading a page. A visit straight to /how-it-works (a search engine, a
 * reload, a shared link) gets public/how-it-works.html instead, which says the same words; the two share their copy and their measures.
 */
export default function HowItWorks() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const site = useSiteShare();
  const wide = useLayoutWidth() >= breakpoints.columnFrom;
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const before = document.title;
    document.title = say.title;
    return () => {
      document.title = before;
    };
  }, []);
  // Back to the home already under this screen when there is one, so its sentence is as it was left; a fresh one otherwise.
  const home = () => router.dismissTo("/");
  return (
    <View style={[styles.screen, { backgroundColor: c.field }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 64 + insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
        <View style={styles.page}>
          <SplitHeader onShare={site.share} />
          <Text role="heading" aria-level={1} style={[wide ? styles.leadWide : styles.lead, { color: c.muted }]}>
            <Text style={{ color: c.ink }}>{say.lead}</Text> {say.rest}
          </Text>
          <View style={styles.start}>
            <Start onPress={home} />
            <Text style={[type.caption, { color: c.muted }]}>{say.note}</Text>
          </View>

          <View style={[styles.section, wide && styles.sectionWide, { borderTopColor: c.hairline }]}>
            <Text role="heading" aria-level={2} style={[styles.head, { color: c.muted }]}>
              {say.stepsHead}
            </Text>
            <View role="list" style={wide ? styles.stepsWide : null}>
              {say.steps.map((step, index) => (
                <View key={step.head} role="listitem" style={wide ? styles.stepWide : styles.step}>
                  <Text style={[styles.number, { color: c.muted }]}>{index + 1}</Text>
                  <View style={styles.stepText}>
                    <Text style={[styles.strong, { color: c.ink }]}>{step.head}</Text>
                    <Text style={[styles.detail, { color: c.muted }]}>{step.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.section, wide && styles.sectionWide, { borderTopColor: c.hairline }]}>
            <Text role="heading" aria-level={2} style={[styles.head, { color: c.muted }]}>
              {say.questionsHead}
            </Text>
            <View style={wide ? styles.questionsWide : null}>
              {say.questions.map((question, index) => (
                <View key={question.ask} style={[styles.question, wide && styles.questionWide, { borderTopColor: c.hairline }, (index === 0 || (wide && index === 1)) && styles.firstQuestion]}>
                  <Text role="heading" aria-level={3} style={[styles.strong, { color: c.ink }]}>
                    {question.ask}
                  </Text>
                  <Text style={[styles.detail, { color: c.muted }]}>{question.answer}</Text>
                </View>
              ))}
            </View>
          </View>

          <Again onPress={home} />
        </View>
      </ScrollView>
      <Toast message={site.notice} onHide={site.hideNotice} />
    </View>
  );
}

/** The black pill under the headline. */
function Start({ onPress }: { onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget onPress={onPress} outsideScroll style={(pressed) => pressStyle(pressed, reduce, pressFeel.pill)}>
      {() => (
        <View style={[styles.cta, { backgroundColor: c.action }]}>
          <Text style={[styles.ctaLabel, { color: c.onAction }]}>{say.start}</Text>
          <Icon name="arrow" size={16} color={c.onAction} />
        </View>
      )}
    </PressTarget>
  );
}

/** The underlined link the page ends with. Its line darkens under a mouse. */
function Again({ onPress }: { onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget onPress={onPress} outsideScroll style={(pressed) => [styles.again, pressStyle(pressed, reduce, pressFeel.slip)]}>
      {(_pressed, hovered) => (
        <View style={styles.againFace}>
          <Text style={[styles.againLabel, { color: c.ink, textDecorationColor: hovered ? c.ink : c.hairline }]}>{say.start}</Text>
          <Icon name="arrow" size={16} color={c.ink} />
        </View>
      )}
    </PressTarget>
  );
}

// The measures of public/how-it-works.html, so a reload there looks like this screen: the home page's 24 px gutter in a 1260 px frame, whose text starts 114 px in at 1440 px, as home's does.
const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { alignSelf: "center", width: "100%", maxWidth: 1260, paddingHorizontal: layout.gutter },
  lead: { ...type.say, letterSpacing: -0.6, marginTop: 30 },
  leadWide: { ...type.sayWide, letterSpacing: -0.88, marginTop: 30, maxWidth: 720 },
  start: { marginTop: 32, flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 12, columnGap: 20 },
  cta: { flexDirection: "row", alignItems: "center", gap: 10, height: 50, paddingHorizontal: 24, borderRadius: 25 },
  ctaLabel: { ...type.title, fontSize: 17 },
  section: { marginTop: 56, paddingTop: 24, borderTopWidth: 1 },
  sectionWide: { marginTop: 72 },
  head: { ...type.caption, fontWeight: "500", marginBottom: 16 },
  step: { flexDirection: "row", paddingVertical: 10 },
  stepsWide: { flexDirection: "row", gap: 40 },
  stepWide: { flex: 1, gap: 8 },
  number: { width: 28, fontSize: 17, lineHeight: 26, fontVariant: ["tabular-nums"] },
  stepText: { flex: 1 },
  strong: { ...type.title, fontSize: 17, lineHeight: 26 },
  detail: { ...type.body, marginTop: 2 },
  questionsWide: { flexDirection: "row", flexWrap: "wrap", columnGap: 40 },
  question: { paddingVertical: 16, borderTopWidth: 1 },
  // Two to a row: each takes half of what the 40 px gap leaves.
  questionWide: { flexBasis: "40%", flexGrow: 1 },
  firstQuestion: { borderTopWidth: 0, paddingTop: 0 },
  // 40 px above the words, as on the HTML page, less the 9 px the 44 px tap area adds over their 26 px line.
  again: { marginTop: 31, alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  againFace: { flexDirection: "row", alignItems: "center", gap: 8 },
  againLabel: { ...type.body, fontSize: 17, lineHeight: 26, textDecorationLine: "underline", textDecorationThickness: "1px", textUnderlineOffset: "6px" } as TextStyle,
});
