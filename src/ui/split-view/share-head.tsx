import { StyleSheet, Text, View } from "react-native";

import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { linkPress } from "../components/text-link";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { motion, tabular, type, useColors } from "../theme";
import type { BillParts } from "./model";
import { ShareBar } from "./share-bar";

type Props = {
  /** "Your share", or "Sam's share" while someone else is shown. */
  title: string;
  /** The share, or null before a name is picked. */
  amount: string | null;
  bill: BillParts | null;
  /** The bar's legend for the viewed person: "You" or their first name. */
  legend: string;
  /** "What you had" over the breakdown, or null before a name is picked. */
  had: string | null;
  open: boolean;
  onPick: (press: Press) => void;
};

/** The top of the wide layout's column: whose share is shown, which opens the people menu, then the share in large type over the bill's share bar. The links the phone keeps under the intro sit in the top bar. */
export function ShareHead({ title, amount, bill, legend, had, open, onPick }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View testID="share-head">
      <PressTarget name={`${title}. ${say.whoseItems}`} expanded={open} onPress={onPick} style={(pressed) => [styles.pick, pressStyle(pressed, reduce, linkPress)]}>
        {() => (
          <View style={styles.face}>
            <Text numberOfLines={1} style={[styles.title, { color: c.muted }]}>
              {title}
            </Text>
            <View style={[{ transform: [{ rotate: open ? "180deg" : "0deg" }] }, !reduce && turn]}>
              <Icon name="chevron" size={14} color={c.muted} />
            </View>
          </View>
        )}
      </PressTarget>
      {amount === null ? null : (
        <Text testID="share-amount" numberOfLines={1} style={[styles.amount, tabular, { color: c.ink }]}>
          {amount}
        </Text>
      )}
      {bill ? (
        <View style={styles.bar}>
          <ShareBar {...bill} legend={legend} />
        </View>
      ) : null}
      {had ? <Text style={[type.body, styles.had, { color: c.ink, borderBottomColor: c.hairline }]}>{had}</Text> : null}
    </View>
  );
}

/** The chevron turns over with the menu it opens, at the menu's own 200 ms, and turns back as the menu leaves. */
const turn = webStyle({ transitionProperty: "transform", transitionDuration: `${motion.controlIn}ms`, transitionTimingFunction: motion.easeOut });

const styles = StyleSheet.create({
  pick: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", flexShrink: 1, minWidth: 0 },
  face: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  title: { fontFamily: type.body.fontFamily, fontSize: 17, lineHeight: 26, flexShrink: 1 },
  // The title's size on the left, and level with it: the intro's 72 px top padding is the column's 24, the panel's 4 and this label's 44, so the two large lines read as a pair.
  amount: { fontFamily: type.hero.fontFamily, fontWeight: "500", fontSize: 68, lineHeight: 72, letterSpacing: -3 },
  bar: { marginTop: 18 },
  had: { marginTop: 36, paddingBottom: 12, borderBottomWidth: 1, marginBottom: 4 },
});
