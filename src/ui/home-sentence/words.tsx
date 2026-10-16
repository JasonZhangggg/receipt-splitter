import { useState, type ReactNode, type Ref } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { linkPress } from "../components/text-link";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { motion, type, useColors } from "../theme";

/** A plain run of the sentence in its own span, so the font checks see it as a line of text. A name in `Together` can break anywhere to fit. */
export function Words({ children, ink = false, breaks = false }: { children: string; ink?: boolean; breaks?: boolean }) {
  const c = useColors();
  return <Text style={[ink && { color: c.ink }, breaks && [styles.breaks, breakAnywhere]]}>{children}</Text>;
}

const breakAnywhere = webStyle({ overflowWrap: "anywhere" } as never);

type ActProps = { label: string; name?: string; onPress: () => void };

/** An action inside the sentence: its words in ink, underlined in ink. A button does not inherit its font, so the words set it. */
export function Act({ label, name, onPress }: ActProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={name} onPress={onPress} style={(pressed) => [styles.act, pressStyle(pressed, reduce, linkPress)]}>
      {() => <Text style={[type.sayInput, styles.underlined, { color: c.ink, borderBottomColor: c.ink }]}>{label}</Text>}
    </PressTarget>
  );
}

/** The small x after a name or a way to pay. `onAppWord` lifts it to the middle of the app word, whose box is taller than its text. */
export function Remove({ name, onAppWord = false, onPress }: { name: string; onAppWord?: boolean; onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={name} onPress={onPress} style={(pressed) => [styles.remove, onAppWord && styles.onAppWord, pressStyle(pressed, reduce, removePress)]}>
      {() => <Icon name="x" size={12} color={c.muted} />}
    </PressTarget>
  );
}

/**
 * A word and the x after it, kept on one line. A browser may break before any inline box, even after a word joiner, so the two share one
 * box, which moves to the next line whole and lets a long name wrap inside it.
 */
export function Together({ children, role, "aria-label": label }: { children: ReactNode; role?: "group"; "aria-label"?: string }) {
  return (
    <View role={role} aria-label={label} style={styles.together}>
      {children}
    </View>
  );
}

const removePress = { scale: 0.88, pressIn: 140 };

const underlineMark = { dataSet: { underline: "" } };
// The field is 12 px wider than the rule under it (see `Blank`), so its cap is the wrapper plus that.
const sized = webStyle({ fieldSizing: "content", maxWidth: "calc(100% + 12px)" } as never);
const colorChange = webStyle({ transitionProperty: "border-color", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });

/**
 * A blank in the sentence: a field as wide as its placeholder or its text, with a gray rule under it that turns ink on focus. The rule is on a
 * wrapper hugging the text, and the field pads past it with a negative margin, so the hit area is 44 px tall while the layout and the rule stay put.
 * Without field-sizing (iOS Safari before 26.2 does not have it), css.ts sizes the field from `--chars`.
 */
export function Blank({ style, onFocus, onBlur, ref, ...rest }: TextInputProps & { ref?: Ref<TextInput> }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  // A string, because a bare number gets a "px" unit and the calc in css.ts then fails.
  const chars = webStyle({ "--chars": String(Math.max(rest.value?.length ?? 0, rest.placeholder?.length ?? 0, 1)) } as never);
  return (
    <View style={[styles.rule, colorChange, { borderBottomColor: focused ? c.ink : c.dot }]}>
      <TextInput
        ref={ref}
        {...underlineMark}
        placeholderTextColor={c.muted}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[type.sayInput, styles.blank, sized, chars, { color: c.ink }, style]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  act: { alignItems: "baseline", paddingVertical: 9, marginVertical: -9 },
  together: { flexDirection: "row", alignItems: "baseline", maxWidth: "100%" },
  breaks: { flexShrink: 1, minWidth: 0 },
  underlined: { borderBottomWidth: 1.5 },
  remove: { width: 44, height: 44, marginLeft: -10, marginRight: -16, marginVertical: -6, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  // The app word pads its box for the tap area and draws its underline inside it, so the middle of the box sits 3.5 px under the middle of the word.
  onAppWord: { top: -3.5 },
  rule: { maxWidth: "100%", borderBottomWidth: 1.5 },
  blank: { minWidth: 0, paddingVertical: 9, paddingHorizontal: 8, marginVertical: -9, marginHorizontal: -6 },
});
