import { useState, type Ref } from "react";
import { Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { motion, tabular, type, useColors } from "../theme";
import { PressTarget } from "./button";
import { Icon, type IconName } from "./icon";
import { linkPress, underline } from "./text-link";
import { UnderlineInput } from "./underline-input";

const underlined = { dataSet: { underline: "" } };
const ruleChange = webStyle({ transitionProperty: "border-color", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });
const inkChange = webStyle({ transitionProperty: "color, text-decoration-color, background-color", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });
const iconPress = { scale: 0.9, pressIn: 140 };

type LabeledProps = TextInputProps & { label: string; ref?: Ref<TextInput> };

/** A text field with its label above and a thin rule under it. */
export function LabeledField({ label, ref, ...input }: LabeledProps) {
  const c = useColors();
  return (
    <View style={styles.labeled}>
      <Text style={[type.caption, { color: c.muted }]}>{label}</Text>
      <UnderlineInput ref={ref} aria-label={label} {...input} />
    </View>
  );
}

type MoneyProps = TextInputProps & { label: string; unit?: string; ref?: Ref<TextInput>; showLabel?: boolean; width?: number };

/** An amount: the unit and the digits on one rule, right-aligned. With `showLabel` false the label is only the field's accessible name. */
export function MoneyField({ label, unit = "$", showLabel = true, width = 96, ref, onFocus, onBlur, ...input }: MoneyProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ width, flexShrink: 0 }}>
      {showLabel ? <Text style={[type.caption, styles.moneyLabel, { color: c.muted }]}>{label}</Text> : null}
      <View style={[styles.money, ruleChange, { borderBottomColor: focused ? c.ink : c.hairline }]}>
        <Text aria-hidden style={[type.input, { color: c.muted }]}>
          {unit}
        </Text>
        <TextInput
          ref={ref}
          {...underlined}
          aria-label={label}
          inputMode="decimal"
          placeholderTextColor={c.dash}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...input}
          style={[type.input, tabular, styles.moneyInput, { color: c.ink }]}
        />
      </View>
    </View>
  );
}

type OptionsProps<Option extends string> = {
  options: readonly Option[];
  labels: { readonly [Key in Option]: string };
  name: string;
  value: Option;
  onChange: (option: Option) => void;
};

/** A row of words, the chosen one underlined and in full ink. */
export function Options<Option extends string>({ options, labels, name, value, onChange }: OptionsProps<Option>) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View role="group" aria-label={name} style={styles.options}>
      {options.map((option) => {
        const on = option === value;
        return (
          <PressTarget key={option} name={labels[option]} toggled={on} outsideScroll onPress={() => onChange(option)} style={(pressed) => [styles.option, pressStyle(pressed, reduce, linkPress)]}>
            {() => <Text style={[type.body, underline, Platform.OS === "web" && inkChange, { color: on ? c.ink : c.muted, textDecorationColor: on ? c.ink : "transparent" }]}>{labels[option]}</Text>}
          </PressTarget>
        );
      })}
    </View>
  );
}

/** A person as a dot and a name; the dot is filled when they are in. */
export function PersonToggle({ name, on, onPress }: { name: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const ink = on ? c.ink : c.muted;
  return (
    <PressTarget name={name} toggled={on} outsideScroll onPress={onPress} style={(pressed) => [styles.person, pressStyle(pressed, reduce, linkPress)]}>
      {() => (
        <View style={styles.personFace}>
          <View style={[styles.personDot, Platform.OS === "web" && inkChange, { backgroundColor: on ? ink : "transparent", boxShadow: `inset 0 0 0 1px ${ink}` }]} />
          <Text style={[type.body, Platform.OS === "web" && inkChange, { color: ink }]}>{name}</Text>
        </View>
      )}
    </PressTarget>
  );
}

type IconActionProps = {
  label: string;
  icon: IconName;
  size: number;
  onPress: () => void;
  /** Takes no focus from a field being edited. */
  keepsFocus?: boolean;
  /** The ink while the finger is down; at rest every action is the muted gray. */
  pressedInk: "ink" | "warn";
  /** Looks off but still takes a press, so a tap can say why. */
  dim?: boolean;
  /** Looks off and takes no press. */
  disabled?: boolean;
};

/** A header's icon button, 44 px to hit. Its glyph plays its own motion on a press. */
export function IconAction({ label, icon, size, onPress, keepsFocus, pressedInk, dim = false, disabled = false }: IconActionProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={label} outsideScroll keepsFocus={keepsFocus} disabled={disabled} softDisabled={dim} onPress={onPress} style={(pressed) => [styles.iconHit, pressStyle(pressed, reduce, iconPress)]}>
      {(pressed) => <Icon name={icon} size={size} color={dim || disabled ? c.dash : pressed ? c[pressedInk] : c.muted} />}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  labeled: { flex: 1, minWidth: 0 },
  moneyLabel: { textAlign: "right" },
  money: { flexDirection: "row", alignItems: "baseline", justifyContent: "flex-end", gap: 2, borderBottomWidth: 1, paddingVertical: 4 },
  moneyInput: { flexShrink: 1, minWidth: 40, textAlign: "right", padding: 0 },
  options: { flexDirection: "row", flexWrap: "wrap", columnGap: 20 },
  option: { minHeight: 44, justifyContent: "center" },
  person: { minHeight: 44, justifyContent: "center", paddingRight: 14 },
  personFace: { flexDirection: "row", alignItems: "center", gap: 7 },
  personDot: { width: 8, height: 8, borderRadius: 4 },
  iconHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
