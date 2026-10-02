import { Image, StyleSheet, Text, View } from "react-native";

import type { Cents } from "../../core/money";
import { plainAmount } from "../../draft";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { copy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { layout, type, useColors } from "../theme";

type Props = {
  name: string;
  items: number;
  total: Cents;
  thumbnail: string | null;
  /** Opens the photo; absent when there is no photo on this device to show. */
  onView?: () => void;
  onReplace: () => void;
  stacked?: boolean;
};

const tabular = { fontVariant: ["tabular-nums" as const] };

export function ReceiptCard({ name, items, total, thumbnail, onView, onReplace, stacked = false }: Props) {
  const c = useColors();
  const count = `${items} ${items === 1 ? "item" : "items"}`;
  const amount = `$${plainAmount(total)}`;
  const thumb = <Thumbnail thumbnail={thumbnail} onView={onView} size={stacked ? sizes.stacked : sizes.row} />;
  const replace = <Button kind="icon" icon="camera" name={copy.replace} onPress={onReplace} />;
  if (stacked) {
    return (
      <View testID="receipt" style={[styles.ticket, { backgroundColor: c.paper }]}>
        <View style={styles.ticketReplace}>{replace}</View>
        {thumb}
        <Text numberOfLines={1} style={[type.title, styles.ticketName, { color: c.ink }]}>
          {name}
        </Text>
        <Text style={[type.caption, { color: c.muted }]}>{count}</Text>
        <Text style={[type.total, tabular, styles.ticketTotal, { color: c.ink }]}>{amount}</Text>
      </View>
    );
  }
  return (
    <View testID="receipt" style={[styles.row, { backgroundColor: c.paper }]}>
      {thumb}
      <View style={styles.meta}>
        <Text numberOfLines={1} style={[type.title, { color: c.ink }]}>
          {name}
        </Text>
        <Text style={[type.caption, { color: c.muted }]}>{count}</Text>
      </View>
      <View style={styles.total}>
        <Text style={[type.title, tabular, { color: c.ink }]}>{amount}</Text>
        <Text style={[type.caption, { color: c.muted }]}>{copy.total}</Text>
      </View>
      {replace}
    </View>
  );
}

const sizes = { row: { width: 52, height: 64, radius: 10 }, stacked: { width: 116, height: 148, radius: 14 } };

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
  total: { alignItems: "flex-end" },
  ticket: { alignItems: "center", paddingTop: 28, paddingBottom: 26, paddingHorizontal: 20, borderRadius: layout.cardRadius + 2 },
  ticketReplace: { position: "absolute", top: 8, right: 8, zIndex: 1 },
  ticketName: { marginTop: 18, maxWidth: "100%" },
  ticketTotal: { marginTop: 12 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  thumbTarget: { minWidth: 44, minHeight: 44, borderRadius: 10 },
  expand: { position: "absolute", right: 4, bottom: 4, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(17, 18, 20, 0.55)" },
});
