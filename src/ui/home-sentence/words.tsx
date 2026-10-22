import { useEffect, useRef, type ReactNode, type Ref, type RefObject } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { linkPress } from "../components/text-link";
import { focusInPlace } from "../receipt-input/keyboard-room";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { type, useColors } from "../theme";

/** A plain run of the sentence in its own span, so the font checks see it as a line of text. A name can break anywhere to fit. */
export function Words({ children, ink = false, breaks = false }: { children: string; ink?: boolean; breaks?: boolean }) {
  const c = useColors();
  return <Text style={[ink && { color: c.ink }, breaks && breakAnywhere]}>{children}</Text>;
}

const breakAnywhere = webStyle({ overflowWrap: "anywhere" } as never);

/**
 * A field or action with the punctuation that follows it, in one run that cannot break. Browsers, WebKit on iPhone among them, may wrap before a
 * comma or period that follows a field or button, which leaves it alone at the start of the next line.
 */
export function Glued({ children, then }: { children: ReactNode; then: string | undefined }) {
  return then === undefined ? children : <Text style={nowrap}>{children}{then}</Text>;
}

type ActProps = { label: string; name?: string; onPress: () => void; /** The punctuation right after it. */ then?: string; /** An optional step: muted words over a lighter rule. */ quiet?: boolean };

/** An action inside the sentence: its words in ink, underlined in ink, or muted with `quiet`. A button does not inherit its font, so the words set it. */
export function Act({ label, name, onPress, then, quiet = false }: ActProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <Glued then={then}>
      <PressTarget name={name} onPress={onPress} style={(pressed) => [styles.act, pressStyle(pressed, reduce, linkPress)]}>
        {() => <Text style={[type.sayInput, styles.underlined, quiet ? { color: c.muted, borderBottomColor: c.dash } : { color: c.ink, borderBottomColor: c.ink }]}>{label}</Text>}
      </PressTarget>
    </Glued>
  );
}

type RemoveProps = {
  name: string;
  /** Whether other x's of its kind (names, or ways to pay) stay after this one goes. When none do, the focus goes to the control named `fallback`. */
  others: boolean;
  fallback: string;
  /** Lifts the x to the middle of the app word, whose box is taller than its text. */
  onAppWord?: boolean;
  onPress: () => void;
};

/** The small x after a name or a way to pay. Removing with the keyboard keeps the focus in the sentence: next x of its kind, else the previous, else the control that adds one. */
export function Remove({ name, others, fallback, onAppWord = false, onPress }: RemoveProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget
      name={name}
      onPress={({ trigger }) => {
        // Names sit in a group; ways to pay do not.
        const kind = (x: Element) => x.closest("[role=group]") === null;
        const mates = [...document.querySelectorAll<HTMLElement>('[aria-label^="Remove "]')].filter((x) => kind(x) === kind(trigger));
        const at = mates.indexOf(trigger);
        // The focus moves first, while the x is still on the page; the heirs are keyed, so they stay through the removal.
        focusInPlace((others ? (mates[at + 1] ?? mates[at - 1]) : document.querySelector<HTMLElement>(`[aria-label="${fallback}"]`)) ?? null);
        onPress();
      }}
      style={(pressed) => [styles.remove, onAppWord && styles.onAppWord, pressStyle(pressed, reduce, removePress)]}
    >
      {() => <Icon name="x" size={12} color={c.muted} />}
    </PressTarget>
  );
}

/** Keeps a run of the sentence on one line: a name's last letters with its x and comma, or "on Venmo x". */
export const nowrap = webStyle({ whiteSpace: "nowrap" } as never);

const removePress = { scale: 0.88, pressIn: 140 };

const underlineMark = { dataSet: { underline: "" } };
// The field is 12 px wider than the rule under it (see `Blank`), so its cap is the wrapper plus that.
const sized = webStyle({ fieldSizing: "content", maxWidth: "calc(100% + 12px)" } as never);
// A blank stops short of the line's end, so a long handle at the end keeps its period beside it and not alone on the next line.
const leavesRoomForPeriod = webStyle({ maxWidth: "calc(100% - 14px)" } as never);

/**
 * A blank in the sentence: a field as wide as its placeholder or its text, in ink with an ink rule under it, like the actions. The rule is on a
 * wrapper hugging the text, and the field pads past it with a negative margin, so the hit area is 44 px tall while the layout and the rule stay put.
 * Without field-sizing (iOS Safari before 26.2 does not have it), css.ts sizes the field from `--chars`.
 */
export function Blank({ style, ref, then, ...rest }: TextInputProps & { ref?: Ref<TextInput>; /** The punctuation right after it. */ then?: string }) {
  const c = useColors();
  // A string, because a bare number gets a "px" unit and the calc in css.ts then fails.
  const chars = webStyle({ "--chars": String(Math.max(rest.value?.length ?? 0, rest.placeholder?.length ?? 0, 1)) } as never);
  return (
    <Glued then={then}>
      <View style={[styles.rule, leavesRoomForPeriod, { borderBottomColor: c.ink }]}>
        <TextInput
          ref={ref}
          {...underlineMark}
          placeholderTextColor={c.ink}
          style={[type.sayInput, styles.blank, sized, chars, { color: c.ink }, style]}
          {...rest}
        />
      </View>
    </Glued>
  );
}

const styles = StyleSheet.create({
  act: { alignItems: "baseline", paddingVertical: 9, marginVertical: -9 },
  underlined: { borderBottomWidth: 1.5 },
  remove: { width: 44, height: 44, marginLeft: -10, marginRight: -16, marginVertical: -6, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  // The app word pads its box for the tap area and draws its underline inside it, so the middle of the box sits 3.5 px under the middle of the word.
  onAppWord: { top: -3.5 },
  rule: { borderBottomWidth: 1.5 },
  blank: { minWidth: 0, paddingVertical: 9, paddingHorizontal: 8, marginVertical: -9, marginHorizontal: -6 },
});

/** Whether an input method composed text in the field since its last Enter. */
export function useComposed(input: RefObject<TextInput | null>) {
  const composedRef = useRef(false);
  useEffect(() => {
    const field = input.current as unknown as HTMLElement | null;
    if (!field?.addEventListener) return;
    const start = () => (composedRef.current = true);
    field.addEventListener("compositionstart", start);
    return () => field.removeEventListener("compositionstart", start);
  }, [input]);
  return composedRef;
}

const pressEnds = ["pointerup", "pointercancel"] as const;

/** Whether a pointer is down, so a blur caused by a press waits for the press to land before the field closes under it. */
export function usePressing() {
  const pressing = useRef(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const down = () => (pressing.current = true);
    const up = () => (pressing.current = false);
    document.addEventListener("pointerdown", down, true);
    for (const end of pressEnds) document.addEventListener(end, up, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      for (const end of pressEnds) document.removeEventListener(end, up, true);
    };
  }, []);
  return pressing;
}

export const focused = (field: TextInput | null) => field !== null && (field as unknown as Element) === globalThis.document?.activeElement;

export function afterPress(pressing: boolean, run: () => void) {
  if (!pressing) return run();
  const release = () => {
    for (const end of pressEnds) document.removeEventListener(end, release);
    setTimeout(run);
  };
  for (const end of pressEnds) document.addEventListener(end, release);
}
