import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { copy } from "../home-copy";
import { focusInPlace } from "../receipt-input/keyboard-room";
import { type, useColors } from "../theme";
import { pressStyle, useReducedMotion } from "../motion";
import { PressTarget } from "./button";
import { Icon } from "./icon";
import { TextLink } from "./text-link";
import { UnderlineInput } from "./underline-input";

type Props = {
  names: readonly string[];
  /** Returns why the name was not added, or null. */
  onAdd: (name: string) => string | null;
  onRemove?: (name: string) => void;
  outsideScroll?: boolean;
  /** Lets Create open the name field when a name is missing. */
  ref?: Ref<NameField>;
};

export type NameField = { readonly open: () => void };

/** Everyone at the table in one list, the Host first and tagged "you", with an inline field that stays open for the next name. */
export function NameList({ names, onAdd, onRemove, outsideScroll, ref }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const pressing = usePressing(adding);
  const input = useRef<TextInput | null>(null);
  // A field that is already open keeps its place: focus comes back to it, and its blur then leaves it open.
  useImperativeHandle(ref, () => ({ open: () => (adding ? focusInPlace(input.current) : setAdding(true)) }), [adding]);
  const first = names.length === 0;
  const commit = () => {
    if (typed.trim()) setRefusal(onAdd(typed));
    setTyped("");
  };
  return (
    <View role="region" aria-label={copy.peopleHeading} style={styles.section}>
      <Text role="heading" aria-level={2} style={[type.title, { color: c.ink }]}>
        {copy.peopleHeading}
      </Text>
      <View style={styles.row}>
        {names.map((name, index) => (
          <View key={name} role="group" aria-label={index === 0 ? `${name}, ${copy.you}` : name} style={styles.person}>
            <View style={[styles.dot, { backgroundColor: c.ink }]} />
            <Text style={[type.body, { color: c.ink }]}>{name}</Text>
            {index === 0 ? <Text style={[type.caption, styles.you, { color: c.muted }]}>{copy.you}</Text> : null}
            {onRemove ? (
              <PressTarget
                name={copy.removeName(name)}
                outsideScroll={outsideScroll}
                onPress={() => {
                  setRefusal(null);
                  onRemove(name);
                }}
                style={(pressed) => [styles.remove, pressStyle(pressed, reduce, removePress)]}
              >
                {() => <Icon name="x" size={12} color={c.muted} />}
              </PressTarget>
            ) : null}
          </View>
        ))}
        {adding ? (
          <UnderlineInput
            ref={(field) => {
              input.current = field;
              focusInPlace(field);
            }}
            aria-label={first ? copy.yourName : copy.newName}
            placeholder={first ? copy.yourName : copy.newName}
            value={typed}
            enterKeyHint="done"
            autoCapitalize="words"
            onChangeText={(text) => {
              setTyped(text);
              setRefusal(null);
            }}
            onSubmitEditing={commit}
            onKeyPress={(event) => {
              if (event.nativeEvent.key !== "Escape") return;
              setTyped("");
              setAdding(false);
            }}
            submitBehavior="submit"
            blurOnSubmit={false}
            onBlur={() =>
              afterPress(pressing.current, () => {
                if (focused(input.current)) return;
                commit();
                setAdding(false);
              })
            }
            style={styles.input}
          />
        ) : (
          <TextLink plus label={first ? copy.addYourName : copy.addName} onPress={() => setAdding(true)} outsideScroll={outsideScroll} />
        )}
      </View>
      {refusal ? (
        <Text role="alert" style={[type.caption, { color: c.warn }]}>
          {refusal}
        </Text>
      ) : null}
    </View>
  );
}

const removePress = { scale: 0.88, pressIn: 140 };

const pressEnds = ["pointerup", "pointercancel"] as const;

function usePressing(listening: boolean) {
  const pressing = useRef(false);
  useEffect(() => {
    if (!listening || typeof document === "undefined") return;
    const down = () => (pressing.current = true);
    const up = () => (pressing.current = false);
    document.addEventListener("pointerdown", down, true);
    for (const end of pressEnds) document.addEventListener(end, up, true);
    return () => {
      pressing.current = false;
      document.removeEventListener("pointerdown", down, true);
      for (const end of pressEnds) document.removeEventListener(end, up, true);
    };
  }, [listening]);
  return pressing;
}

const focused = (field: TextInput | null) => field !== null && (field as unknown as Element) === globalThis.document?.activeElement;

function afterPress(pressing: boolean, run: () => void) {
  if (!pressing) return run();
  const release = () => {
    for (const end of pressEnds) document.removeEventListener(end, release);
    setTimeout(run);
  };
  for (const end of pressEnds) document.addEventListener(end, release);
}

const styles = StyleSheet.create({
  section: { gap: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 18 },
  person: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  you: { marginLeft: 2 },
  remove: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: { width: 150, marginVertical: 8 },
});
