import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { pressFeel, pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, tabular, type, useColors } from "../theme";
import type { BillParts } from "./model";
import { ShareBar } from "./share-bar";

/** Past "$999.99" the amount drops a size, so "$1,234.56" fits beside the pill on a 360 px phone. */
const longAmount = 7;
const fade = webStyle({ transitionProperty: "opacity", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: "ease" });

export type FooterPill = { readonly kind: "pay"; readonly host: string; /** False while the payer has claimed nothing: the pill shows gray. */ readonly ready: boolean } | { readonly kind: "paid" } | { readonly kind: "ask" };

type Props = {
  label: string;
  amount: string;
  /** The person whose share this is when it is not this phone's own, for the button's name. */
  whose: string | null;
  /** A paid state in words with its ink, under the bar. */
  note: { readonly text: string; readonly ink: string } | null;
  /** The bill in three parts for the bar under the share. */
  bill: BillParts | null;
  pill: FooterPill | null;
  onOpen: (press: Press) => void;
  onHeight: (height: number) => void;
  /** Rise in from the bottom edge on mount, as when the pick sheet has just gone down. */
  rise?: boolean;
};

/** Fixed to the bottom of the page. The muted label over the amount, with the pill that opens the Pay sheet centered beside them both; under them the share bar across the width. */
export function SplitFooter({ label, amount, whose, note, bill, pill, onOpen, onHeight, rise = false }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const bar = useRef<View>(null);
  const [mount] = useState({ rise, reduced });
  useLayoutEffect(() => {
    const el = bar.current as unknown as HTMLElement | null;
    if (!mount.rise || typeof el?.animate !== "function") return;
    const frames = mount.reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: "translateY(100%)" }, { transform: "none" }];
    const rising = el.animate(frames, { duration: mount.reduced ? motion.reducedFade : motion.footerIn, easing: mount.reduced ? motion.easeOut : motion.easeDrawer });
    return () => rising.cancel();
  }, [mount]);
  return (
    <View
      ref={bar}
      testID="footer"
      onLayout={(event) => onHeight(Math.ceil(event.nativeEvent.layout.height))}
      style={[styles.footer, { backgroundColor: c.field, borderTopColor: c.hairline, paddingBottom: Math.max(insets.bottom, 12) + 8, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}
    >
      <View style={styles.column}>
        {pill?.kind === "ask" ? (
          <View style={styles.main}>
            <Text style={[type.caption, styles.ask, { color: c.muted }]}>{say.browse}</Text>
            <Pill pill={pill} onPress={onOpen} />
          </View>
        ) : (
          <>
            <View style={styles.main}>
              <PressTarget name={`${label} ${amount}, ${say.showBreakdown(whose)}`} outsideScroll onPress={onOpen} style={(pressed) => [styles.share, pressStyle(pressed, reduced)]}>
                {() => (
                  <>
                    <View style={styles.labelLine}>
                      <Text numberOfLines={1} style={[styles.label, { color: c.muted }]}>
                        {label}
                      </Text>
                      <View style={styles.up}>
                        <Icon name="chevron" size={13} color={c.muted} />
                      </View>
                    </View>
                    <Text testID="owe" style={[styles.amount, amount.length > longAmount && styles.longAmount, tabular, { color: c.ink }]}>
                      {amount}
                    </Text>
                  </>
                )}
              </PressTarget>
              {pill ? <Pill pill={pill} onPress={onOpen} /> : null}
            </View>
            {bill ? (
              <View style={styles.bar}>
                <ShareBar {...bill} />
              </View>
            ) : null}
            {note ? (
              <Text testID="share-note" numberOfLines={1} style={[type.caption, tabular, styles.note, { color: note.ink }]}>
                {note.text}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function Pill({ pill, onPress }: { pill: FooterPill; onPress: (press: Press) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const paid = pill.kind === "paid";
  const text = pill.kind === "pay" ? say.payHost(pill.host) : pill.kind === "ask" ? say.question : say.paidMark;
  const ink = paid ? c.ink : c.onAction;
  const idle = pill.kind === "pay" && !pill.ready;
  return (
    <PressTarget name={paid ? say.paid : text} outsideScroll softDisabled={idle} onPress={onPress} style={(pressed) => [styles.pillHit, pressStyle(pressed, reduce, pressFeel.pill)]}>
      {() => (
        <View style={[styles.pill, !paid && !reduce && fade, paid ? { boxShadow: `inset 0 0 0 1px ${c.hairline}` } : { backgroundColor: c.action, opacity: idle ? 0.28 : 1 }]}>
          <Text numberOfLines={1} style={[type.body, styles.pillText, { color: ink }]}>
            {text}
          </Text>
          {pill.kind === "pay" ? <Icon name="arrow" size={14} color={ink} /> : null}
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", borderTopWidth: 1, paddingTop: 14 },
  column: { width: "100%", maxWidth: 480 },
  // The pill sits on the middle of the label and the amount together.
  main: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  // Zero width with a full-width floor: a long name never widens the share past the amount, so it ellipsizes instead of pushing the pill.
  labelLine: { flexDirection: "row", alignItems: "center", gap: 5, width: 0, minWidth: "100%" },
  label: { fontFamily: type.caption.fontFamily, fontSize: 15, lineHeight: 20, flexShrink: 1, minWidth: 0 },
  up: { transform: [{ rotate: "180deg" }] },
  ask: { flex: 1, minWidth: 0 },
  share: { flexGrow: 1, flexShrink: 0, minHeight: 44, justifyContent: "center" },
  amount: { fontFamily: type.hero.fontFamily, fontWeight: "500", fontSize: 46, lineHeight: 50, letterSpacing: -2, marginTop: 2 },
  longAmount: { fontSize: 36, lineHeight: 50, letterSpacing: -1.4 },
  bar: { marginTop: 14 },
  note: { marginTop: 8 },
  // The pill gives up room before the amount does: its words ellipsize, the money never does.
  pillHit: { flexShrink: 1, minWidth: 0, maxWidth: "58%", borderRadius: 25 },
  pill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, paddingLeft: 24, paddingRight: 22, borderRadius: 25 },
  pillText: { flexShrink: 1, fontSize: 16, lineHeight: 22, fontWeight: "500" },
});
