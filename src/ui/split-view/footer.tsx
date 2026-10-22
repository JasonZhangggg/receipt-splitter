import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { pressFeel, pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, tabular, type, useColors } from "../theme";

const fade = webStyle({ transitionProperty: "opacity", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: "ease" });

export type FooterPill = { readonly kind: "pay"; readonly host: string; /** False while the payer has claimed nothing: the pill shows gray. */ readonly ready: boolean } | { readonly kind: "paid" } | { readonly kind: "ask" };

type Props = {
  label: string;
  amount: string;
  /** The person whose share this is when it is not this phone's own, for the button's name. */
  whose: string | null;
  /** What sits across from the label: the items count, or a paid state in words with its ink. */
  aside: { readonly text: string; readonly ink: string; readonly paidState: boolean };
  pill: FooterPill | null;
  onOpen: (press: Press) => void;
  onHeight: (height: number) => void;
  /** Rise in from the bottom edge on mount, as when the pick sheet has just gone down. */
  rise?: boolean;
};

/** Fixed to the bottom of the page. The label and the items count share a muted line; under it the amount and the pill that opens the Pay sheet. */
export function SplitFooter({ label, amount, whose, aside, pill, onOpen, onHeight, rise = false }: Props) {
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
      style={[styles.bar, { backgroundColor: c.field, borderTopColor: c.hairline, paddingBottom: Math.max(insets.bottom, 12) + 8, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}
    >
      <View style={styles.column}>
        {pill?.kind === "ask" ? null : (
          <View style={styles.top}>
            <Text numberOfLines={1} style={[type.caption, styles.label, { color: c.muted }]}>
              {label}
            </Text>
            <Text testID={aside.paidState ? "share-note" : undefined} numberOfLines={1} style={[type.caption, tabular, styles.aside, { color: aside.ink }]}>
              {aside.text}
            </Text>
          </View>
        )}
        <View style={styles.bottom}>
          {pill?.kind === "ask" ? (
            <Text style={[type.caption, styles.ask, { color: c.muted }]}>{say.browse}</Text>
          ) : (
            <PressTarget name={`${label} ${amount}, ${say.showBreakdown(whose)}`} outsideScroll onPress={onOpen} style={(pressed) => [styles.share, pressStyle(pressed, reduced)]}>
              {() => (
                <Text testID="owe" numberOfLines={1} style={[styles.amount, tabular, { color: c.ink }]}>
                  {amount}
                </Text>
              )}
            </PressTarget>
          )}
          {pill ? <Pill pill={pill} onPress={onOpen} /> : null}
        </View>
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
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", borderTopWidth: 1, paddingTop: 14 },
  column: { width: "100%", maxWidth: 480 },
  top: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  label: { flexShrink: 1, minWidth: 0 },
  aside: { flexShrink: 0, maxWidth: "100%", textAlign: "right" },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 },
  ask: { flex: 1, minWidth: 0 },
  share: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" },
  amount: { fontFamily: type.hero.fontFamily, fontWeight: "500", fontSize: 32, lineHeight: 44, letterSpacing: -0.96 },
  pillHit: { flexShrink: 0, maxWidth: "58%", borderRadius: 22 },
  pill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, paddingLeft: 20, paddingRight: 18, borderRadius: 22 },
  pillText: { flexShrink: 1, fontSize: 15, lineHeight: 22, fontWeight: "500" },
});
