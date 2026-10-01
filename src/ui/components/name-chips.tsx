import { StyleSheet, Text, View } from "react-native";

import { copy } from "../home-copy";
import { type, useColors } from "../theme";
import { Button } from "./button";

type Props = { names: string[]; onAdd: () => void; outsideScroll?: boolean };

export function NameChips({ names, onAdd, outsideScroll }: Props) {
  const c = useColors();
  return (
    <View role="group" aria-label={copy.people} style={styles.row}>
      {names.map((name) => (
        <View key={name} style={[styles.chip, { backgroundColor: c.sheetIn }]}>
          <Text style={[type.label, { color: c.ink }]}>{name}</Text>
        </View>
      ))}
      <Button kind="chip" icon="plus" label={copy.addName.label} name={copy.addName.name} onPress={onAdd} outsideScroll={outsideScroll} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center" },
});
