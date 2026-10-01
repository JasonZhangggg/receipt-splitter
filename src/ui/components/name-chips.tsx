import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { copy } from "../home-copy";
import { layout, type, useColors } from "../theme";
import { Button } from "./button";

type Props = {
  names: readonly string[];
  onAdd: (name: string) => void;
  /** Absent once the link exists, since people can only be added to a Split. */
  onRemove?: (name: string) => void;
  outsideScroll?: boolean;
};

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
      {names.map((name) => (
        <View key={name} style={[styles.chip, onRemove && styles.named, { backgroundColor: c.sheetIn }]}>
          <Text style={[type.label, { color: c.ink }]}>{name}</Text>
          {onRemove ? <Button kind="icon" icon="x" name={copy.removeName(name)} onPress={() => onRemove(name)} outsideScroll={outsideScroll} /> : null}
        </View>
      ))}
      {adding ? (
        <TextInput
          autoFocus
          aria-label={names.length === 0 ? copy.yourName : copy.newName}
          placeholder={names.length === 0 ? copy.yourName : copy.newName}
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
          style={[type.input, styles.input, { color: c.ink, backgroundColor: c.sheetIn }]}
        />
      ) : null}
      <Button kind="chip" icon="plus" label={names.length === 0 ? copy.addYourName : copy.addName.label} name={names.length === 0 ? copy.addYourName : copy.addName.name} onPress={() => setAdding(true)} outsideScroll={outsideScroll} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: layout.pairGap },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center" },
  named: { flexDirection: "row", alignItems: "center", paddingRight: 0 },
  input: { minHeight: 44, width: 120, paddingHorizontal: 16, borderRadius: 22 },
});
