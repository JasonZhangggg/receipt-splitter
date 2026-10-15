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

type ActProps = { label: string; name?: string; quiet?: boolean; onPress: () => void };

/** An action inside the sentence: its words underlined, in ink, or gray when it only adds to what is there. A button does not inherit its font, so the words set it. */
export function Act({ label, name, quiet = false, onPress }: ActProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={name} onPress={onPress} style={(pressed) => [styles.act, pressStyle(pressed, reduce, linkPress)]}>
      {() => <Text style={[type.sayInput, styles.underlined, { color: quiet ? c.muted : c.ink, borderBottomColor: quiet ? c.dot : c.ink }]}>{label}</Text>}
    </PressTarget>
  );
}

/** The small x after a name or an added way to pay. */
export function Remove({ name, onPress }: { name: string; onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={name} onPress={onPress} style={(pressed) => [styles.remove, pressStyle(pressed, reduce, removePress)]}>
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
const sized = webStyle({ fieldSizing: "content", maxWidth: "100%" } as never);
const colorChange = webStyle({ transitionProperty: "border-color", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });

/** A blank in the sentence: a field as wide as its placeholder or its text, with a gray rule under it that turns ink on focus. Without field-sizing (iOS Safari before 26.2 does not have it), css.ts sizes it from `--chars`. */
export function Blank({ style, onFocus, onBlur, ref, ...rest }: TextInputProps & { ref?: Ref<TextInput> }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const chars = webStyle({ "--chars": Math.max(rest.value?.length ?? 0, rest.placeholder?.length ?? 0, 1) } as never);
  return (
    <TextInput
      ref={ref}
      {...underlineMark}
      placeholderTextColor={c.dash}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[type.sayInput, styles.blank, sized, chars, colorChange, { color: c.ink, borderBottomColor: focused ? c.ink : c.dot }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  act: { alignItems: "baseline" },
  together: { flexDirection: "row", alignItems: "baseline", maxWidth: "100%" },
  breaks: { flexShrink: 1, minWidth: 0 },
  underlined: { borderBottomWidth: 1.5 },
  remove: { width: 24, height: 32, marginRight: -6, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  blank: { minWidth: 0, paddingVertical: 0, paddingHorizontal: 2, borderBottomWidth: 1.5 },
});
