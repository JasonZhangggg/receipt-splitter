import { Image, StyleSheet, Text, View } from "react-native";

import type { Cents } from "../../core/money";
import { money } from "../../draft";
import { PressTarget } from "../components/button";
import { TextLink } from "../components/text-link";
import { copy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { tabular, type, useColors } from "../theme";
import { DropCard, Slip, slipLines } from "./drop-card";

type Props = { items: number; total: Cents; thumbnail: string | null; onView?: () => void; onReplace: () => void };

const size = { width: 52, height: 68 };

/** The read receipt: a thumbnail that opens the photo, the total, how many Items, and a way to replace it. */
export function ReceiptSummary({ items, total, thumbnail, onView, onReplace }: Props) {
  const c = useColors();
  return (
    <DropCard>
      <View testID="receipt" style={styles.row}>
        <Thumbnail thumbnail={thumbnail} onView={onView} />
        <View style={styles.meta}>
          <View style={styles.line}>
            <Text style={[type.body, { color: c.ink }]}>{copy.receipt}</Text>
            <Text style={[type.body, tabular, { color: c.ink }]}>{money(total)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={[type.caption, { color: c.muted }]}>{`${items} ${items === 1 ? "item" : "items"}`}</Text>
            <TextLink label={copy.replace} name={copy.replaceReceipt} onPress={onReplace} />
          </View>
        </View>
      </View>
    </DropCard>
  );
}

function Thumbnail({ thumbnail, onView }: { thumbnail: string | null; onView?: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const face = thumbnail ? <Image source={{ uri: thumbnail }} style={[styles.photo, { backgroundColor: c.hairline }]} /> : <Slip lines={slipLines} />;
  if (!onView) return face;
  return (
    <PressTarget name={copy.viewPhoto} onPress={onView} style={(pressed) => [styles.target, pressStyle(pressed, reduce)]}>
      {() => face}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  meta: { flex: 1, minWidth: 0, gap: 2 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  photo: { ...size, borderRadius: 4 },
  target: { ...size, borderRadius: 4 },
});
