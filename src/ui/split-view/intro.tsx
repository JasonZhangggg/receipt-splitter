import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Press } from "../components/button";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import { TextLink } from "../components/text-link";

type Props = {
  host: string;
  /** Where the links row ends, in screen pixels, each time the intro lays out: the pick sheet opens just below it. */
  onLinksBottom?: (bottom: number) => void;
  total: string;
  onReceipt?: (press: Press) => void;
  onPeople: (press: Press) => void;
  onPayments: (press: Press) => void;
  onHistory: (press: Press) => void;
};

/** Who paid and what to do, then the underlined links to the Receipt photo, People, Payments and History. */
export function SplitIntro({ host, total, onLinksBottom, onReceipt, onPeople, onPayments, onHistory }: Props) {
  const c = useColors();
  const links = useRef<View>(null);
  const reportLinks = () => {
    const row = links.current as unknown as HTMLElement | null;
    if (onLinksBottom && row?.getBoundingClientRect) onLinksBottom(Math.round(row.getBoundingClientRect().bottom));
  };
  return (
    <View onLayout={reportLinks} style={styles.box}>
      <Text style={[type.body, { color: c.muted }]}>{say.intro(host, total)}</Text>
      <View ref={links} style={styles.links}>
        {onReceipt ? <TextLink label={say.receipt} onPress={onReceipt} /> : null}
        <TextLink label={say.people} onPress={onPeople} />
        <TextLink label={say.payments} onPress={onPayments} />
        <TextLink label={say.history} onPress={onHistory} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingTop: 6, paddingBottom: 4 },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: 20, marginTop: 4 },
});
