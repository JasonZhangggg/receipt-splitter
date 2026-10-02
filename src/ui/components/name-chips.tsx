import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { copy } from "../home-copy";
import { layout, type, useColors } from "../theme";
import { Button } from "./button";

type Props = {
  names: readonly string[];
  /** Returns why the name was not added, or null. */
  onAdd: (name: string) => string | null;
  onRemove?: (name: string) => void;
  outsideScroll?: boolean;
};

export function NameChips({ names, onAdd, onRemove, outsideScroll }: Props) {
  const c = useColors();
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const first = names.length === 0;
  const commit = () => {
    if (typed.trim()) setRefusal(onAdd(typed));
    setTyped("");
  };
  return (
    <View role="group" aria-label={copy.people} style={styles.row}>
      {names.map((name) => (
        <View key={name} style={[styles.chip, onRemove && styles.named, { backgroundColor: c.sheetIn }]}>
          <Text style={[type.label, { color: c.ink }]}>{name}</Text>
          {onRemove ? (
            <Button
              kind="icon"
              icon="x"
              name={copy.removeName(name)}
              onPress={() => {
                setRefusal(null);
                onRemove(name);
              }}
              outsideScroll={outsideScroll}
            />
          ) : null}
        </View>
      ))}
      {adding ? (
        <TextInput
          autoFocus
          aria-label={first ? copy.yourName : copy.newName}
          placeholder={first ? copy.yourName : copy.newName}
          placeholderTextColor={c.muted}
          value={typed}
          enterKeyHint="done"
          autoCapitalize="words"
          onChangeText={(text) => {
            setTyped(text);
            setRefusal(null);
          }}
          onSubmitEditing={commit}
          submitBehavior="submit"
          blurOnSubmit={false}
          onBlur={() =>
            afterPress(() => {
              commit();
              setAdding(false);
            })
          }
          style={[type.input, styles.input, { color: c.ink, backgroundColor: c.sheetIn }]}
        />
      ) : null}
      <View {...(adding && keepFocus)}>
        <Button
          kind="chip"
          icon="plus"
          {...(first && !adding ? { label: copy.addYourName } : { label: copy.addName.label, name: copy.addName.name })}
          onPress={adding ? commit : () => setAdding(true)}
          outsideScroll={outsideScroll}
        />
      </View>
      {refusal ? (
        <View style={styles.refusalLine}>
          <Text role="alert" style={[type.small, styles.refusal, { backgroundColor: c.flagWash, color: c.flag }]}>
            {refusal}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** A click on + Add while a name field is open keeps the field focused, so the click commits the name and the field stays open for the next. */
const keepFocus = { onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault() };

const pressEnds = ["pointerup", "pointercancel"] as const;
let pressing = false;
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => (pressing = true), true);
  for (const end of pressEnds) document.addEventListener(end, () => (pressing = false), true);
}

/** Closing the field changes the height of the sheet above the bottom edge, which moves every control in it. A blur that a press caused closes it only once that press has landed. */
function afterPress(run: () => void) {
  if (!pressing) return run();
  const release = () => {
    for (const end of pressEnds) document.removeEventListener(end, release);
    setTimeout(run);
  };
  for (const end of pressEnds) document.addEventListener(end, release);
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: layout.pairGap },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center" },
  named: { flexDirection: "row", alignItems: "center", paddingRight: 0 },
  input: { minHeight: 44, width: 120, paddingHorizontal: 16, borderRadius: 22 },
  refusalLine: { flexBasis: "100%" },
  refusal: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
