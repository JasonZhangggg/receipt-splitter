import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { copy } from "../home-copy";
import { type, useColors } from "../theme";
import { Button } from "./button";

type Props = { names: readonly string[]; onAdd: (name: string) => void; onRemove: (name: string) => void; outsideScroll?: boolean };

export function NameChips({ names, onAdd, onRemove, outsideScroll }: Props) {
  const c = useColors();
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const commit = () => {
    onAdd(typed);
    setTyped("");
  };
  return (
    <View role="group" aria-label={copy.people} style={styles.row}>
      <View style={[styles.chip, { backgroundColor: c.sheetIn }]}>
        <Text style={[type.label, { color: c.ink }]}>{copy.me}</Text>
      </View>
      {names.map((name) => (
        <View key={name} style={[styles.chip, styles.named, { backgroundColor: c.sheetIn }]}>
          <Text style={[type.label, { color: c.ink }]}>{name}</Text>
          <Button kind="icon" icon="x" name={copy.removeName(name)} onPress={() => onRemove(name)} outsideScroll={outsideScroll} />
        </View>
      ))}
      {adding ? (
        <TextInput
          autoFocus
          aria-label={copy.newName}
          placeholder={copy.newName}
          placeholderTextColor={c.muted}
          value={typed}
          enterKeyHint="done"
          autoCapitalize="words"
          onChangeText={setTyped}
          onSubmitEditing={commit}
          submitBehavior="submit"
          onBlur={() => {
            commit();
            setAdding(false);
          }}
          style={[type.body, styles.input, { color: c.ink, backgroundColor: c.sheetIn }]}
        />
      ) : null}
      <Button kind="chip" icon="plus" label={copy.addName.label} name={copy.addName.name} onPress={() => setAdding(true)} outsideScroll={outsideScroll} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center" },
  named: { flexDirection: "row", alignItems: "center", paddingRight: 0 },
  input: { minHeight: 44, width: 120, paddingHorizontal: 16, borderRadius: 22 },
});
