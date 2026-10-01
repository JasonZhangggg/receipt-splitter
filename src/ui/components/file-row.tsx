import { Image, StyleSheet, Text, View } from "react-native";

import { copy } from "../home-copy";
import { type, useColors } from "../theme";
import { Button } from "./button";

type Props = { name: string; items: number; thumbnail: string; onReplace: () => void };

export function FileRow({ name, items, thumbnail, onReplace }: Props) {
  const c = useColors();
  return (
    <View style={[styles.row, { backgroundColor: c.paper }]}>
      <Image source={{ uri: thumbnail }} style={[styles.thumbnail, { backgroundColor: c.hairline }]} />
      <View style={styles.meta}>
        <Text numberOfLines={1} style={[type.label, { color: c.ink }]}>
          {name}
        </Text>
        <Text style={[type.caption, { color: c.muted }]}>{`${items} ${items === 1 ? "item" : "items"}`}</Text>
      </View>
      <Button kind="icon" icon="camera" name={copy.replace} onPress={onReplace} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 4, borderRadius: 18 },
  thumbnail: { width: 40, height: 52, borderRadius: 8 },
  meta: { flex: 1, minWidth: 0 },
});
