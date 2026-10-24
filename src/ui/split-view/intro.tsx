import { useRef } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { Press } from "../components/button";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import { TextLink } from "../components/text-link";

type Props = {
  host: string;
  /** Where the links row ends, in screen pixels, each time the intro lays out: the pick sheet opens just below it. */
  onLinksBottom?: (bottom: number) => void;
  total: string;
  /** Where the receipt came from, when the Split kept it. */
  place?: string;
  onReceipt?: (press: Press) => void;
  onPeople: (press: Press) => void;
  onPayments: (press: Press) => void;
  onHistory: (press: Press) => void;
  /** The wide layout: a larger title, and no links row, since the top bar carries the links. */
  wide?: boolean;
};

/** The place in large type, or the total when the Split has no place, then who paid, then the ink links to the Receipt photo, People, Payments and History. */
export function SplitIntro({ host, total, place, onLinksBottom, onReceipt, onPeople, onPayments, onHistory, wide = false }: Props) {
  const c = useColors();
  const links = useRef<View>(null);
  const reportLinks = () => {
    const row = links.current as unknown as HTMLElement | null;
    if (onLinksBottom && row?.getBoundingClientRect) onLinksBottom(Math.round(row.getBoundingClientRect().bottom));
  };
  const title = place ?? total;
  const long = title.length > longTitle;
  return (
    <View onLayout={reportLinks} style={wide ? styles.wideBox : styles.box}>
      <Text role="heading" aria-level={2} testID="split-title" numberOfLines={3} style={[styles.title, wide && styles.wideTitle, long && (wide ? styles.wideLongTitle : styles.longTitle), breakAnywhere, { color: c.ink }]}>
        {title}
      </Text>
      <Text testID="paid-by" style={[type.body, wide ? styles.widePaid : styles.paid, { color: c.muted }]}>
        {`${say.paidBy} `}
        <Text style={{ color: c.ink }}>{host}</Text>
      </Text>
      {wide ? null : (
        <View ref={links} style={styles.links}>
          {onReceipt ? <TextLink ink body label={say.receipt} onPress={onReceipt} /> : null}
          <TextLink ink body label={say.people} onPress={onPeople} />
          <TextLink ink body label={say.payments} onPress={onPayments} />
          <TextLink ink body label={say.history} onPress={onHistory} />
        </View>
      )}
    </View>
  );
}

/** Past this many characters a place drops a size, so a long name still reads whole in two or three lines; three is the cap, with an ellipsis. */
const longTitle = 24;
// One word wider than the column breaks instead of spilling sideways.
const breakAnywhere = { overflowWrap: "anywhere" } as TextStyle;

const styles = StyleSheet.create({
  box: { paddingTop: 18, paddingBottom: 4 },
  wideBox: { paddingTop: 72, paddingBottom: 20 },
  title: { fontFamily: type.hero.fontFamily, fontWeight: "500", fontSize: 46, lineHeight: 50, letterSpacing: -2 },
  wideTitle: { fontSize: 68, lineHeight: 72, letterSpacing: -3 },
  longTitle: { fontSize: 34, lineHeight: 38, letterSpacing: -1.3 },
  wideLongTitle: { fontSize: 48, lineHeight: 52, letterSpacing: -2 },
  paid: { marginTop: 6 },
  widePaid: { marginTop: 10, fontSize: 17, lineHeight: 26 },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: 24, marginTop: 10 },
});
