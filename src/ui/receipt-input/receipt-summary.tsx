import { Image, StyleSheet, Text, View } from "react-native";

import type { Cents } from "../../core/money";
import { money } from "../../draft";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { copy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { layout, tabular, type, useColors } from "../theme";

type Props = {
  items: number;
  total: Cents;
  thumbnail: string | null;
  onView?: () => void;
  onReplace: () => void;
  stacked?: boolean;
};


export function ReceiptSummary({ items, total, thumbnail, onView, onReplace, stacked = false }: Props) {
  const c = useColors();
  const count = `${items} ${items === 1 ? "item" : "items"}`;
  const amount = money(total);
  const thumb = <Thumbnail thumbnail={thumbnail} onView={onView} size={stacked ? sizes.stacked : sizes.row} />;
  const replace = <Button kind="icon" icon="camera" name={copy.replace} onPress={onReplace} />;
  if (stacked) {
    return (
      <View testID="receipt" style={[styles.ticket, { backgroundColor: c.paper }]}>
        <View style={styles.ticketReplace}>{replace}</View>
        {thumb}
        <Text style={[type.hero, tabular, styles.ticketTotal, { color: c.ink }]}>{amount}</Text>
        <Text style={[type.caption, { color: c.muted }]}>{count}</Text>
      </View>
    );
  }
  return (
    <View testID="receipt" style={[styles.row, { backgroundColor: c.paper }]}>
      {thumb}
      <View style={styles.meta}>
        <Text style={[type.title, tabular, { color: c.ink }]}>{amount}</Text>
        <Text style={[type.caption, { color: c.muted }]}>{count}</Text>
      </View>
      {replace}
    </View>
  );
}

const sizes = { row: { width: 52, height: 64, radius: 10 }, stacked: { width: 100, height: 128, radius: 14 } };

function Thumbnail({ thumbnail, onView, size }: { thumbnail: string | null; onView?: () => void; size: (typeof sizes)["row"] }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const frame = { width: size.width, height: size.height, borderRadius: size.radius };
  const face = thumbnail ? (
    <Image source={{ uri: thumbnail }} style={[frame, { backgroundColor: c.hairline }]} />
  ) : (
    <View style={[frame, styles.placeholder, { backgroundColor: c.inset }]}>
      <Icon name="receipt" size={20} color={c.muted} />
    </View>
  );
  if (!onView) return face;
  return (
    <PressTarget name={copy.viewPhoto} onPress={onView} style={(pressed) => [styles.thumbTarget, pressStyle(pressed, reduce)]}>
      {() => (
        <View>
          {face}
          <View style={styles.expand}>
            <Icon name="expand" size={12} color="#FFFFFF" />
          </View>
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingLeft: 12, paddingRight: 4, borderRadius: 20 },
  meta: { flex: 1, minWidth: 0 },
  ticket: { alignItems: "center", paddingTop: 24, paddingBottom: 22, paddingHorizontal: 20, borderRadius: layout.cardRadius + 2 },
  ticketReplace: { position: "absolute", top: 8, right: 8, zIndex: 1 },
  ticketTotal: { marginTop: 14 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  thumbTarget: { minWidth: 44, minHeight: 44, borderRadius: 10 },
  expand: { position: "absolute", right: 4, bottom: 4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(17, 18, 20, 0.55)" },
});
