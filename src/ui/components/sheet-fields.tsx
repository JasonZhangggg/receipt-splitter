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

type LabeledProps = TextInputProps & { label: string; ref?: Ref<TextInput>; /** A muted word before the text on the same rule, such as an Item's "2×". */ prefix?: string };

/** A text field with its label above and a thin rule under it. */
export function LabeledField({ label, ref, prefix, onFocus, onBlur, ...input }: LabeledProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  if (!prefix) {
    return (
      <View style={styles.labeled}>
        <Text style={[type.caption, { color: c.muted }]}>{label}</Text>
        <UnderlineInput ref={ref} aria-label={label} onFocus={onFocus} onBlur={onBlur} {...input} />
      </View>
    );
  }
  return (
    <View style={styles.labeled}>
      <Text style={[type.caption, { color: c.muted }]}>{label}</Text>
      <View style={[styles.prefixed, ruleChange, { borderBottomColor: focused ? c.ink : c.hairline }]}>
        <Text aria-hidden style={[type.input, tabular, { color: c.muted }]}>
          {prefix}
        </Text>
        <UnderlineInput
          ref={ref}
          aria-label={label}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...input}
          style={styles.prefixedInput}
        />
      </View>
    </View>
  );
}

// The field reaches 14 px a character of its unit leftward over the unit, plus the gap, and 13 px above and below, with margins taking it back, so a tap on the unit or near the rule focuses it and nothing moves.
const unitReach = (unit: string) => (unit ? unit.length * 14 + unitGap : 0);
// The same gap an Item's "2×" keeps before its name, so the two read as one pattern.
const unitGap = 8;

type MoneyProps = TextInputProps & { label: string; unit?: string; ref?: Ref<TextInput>; showLabel?: boolean; width?: number; reach?: number };

/**
 * An amount: the unit a word-space before the digits, right-aligned on one rule. The field is at least `width` wide and grows leftward with the digits, so the unit stays beside the number at any length.
 * With `showLabel` false the label is only the field's accessible name. `reach` is how far left of the unit a tap still focuses it, for a field that ends a row.
 */
export function MoneyField({ label, unit = "$", showLabel = true, width = 76, reach = 0, ref, onFocus, onBlur, onChangeText, value, defaultValue, placeholder, ...input }: MoneyProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  // This copy of an uncontrolled field's text only sizes it.
  const [typed, setTyped] = useState(defaultValue ?? "");
  const text = value ?? typed;
  const over = unitReach(unit) + reach;
  return (
    <View style={{ minWidth: width, flexShrink: 0 }}>
      {showLabel ? <Text style={[type.caption, styles.moneyLabel, { color: c.muted }]}>{label}</Text> : null}
      <View style={[styles.money, ruleChange, { borderBottomColor: focused ? c.ink : c.hairline }]}>
        {unit ? (
          <Text aria-hidden style={[type.input, { color: c.muted }]}>
            {unit}
          </Text>
        ) : null}
        <View>
          <Text aria-hidden numberOfLines={1} style={[type.input, tabular, styles.moneySizer]}>
            {text || placeholder || " "}
          </Text>
          <TextInput
            ref={ref}
            {...underlined}
            aria-label={label}
            inputMode="decimal"
            placeholder={placeholder}
            placeholderTextColor={c.muted}
            value={value}
            defaultValue={defaultValue}
            onChangeText={(next) => {
              setTyped(next);
              onChangeText?.(next);
            }}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            {...input}
            style={[type.input, tabular, styles.moneyInput, { color: c.ink, left: -over, paddingLeft: over }]}
          />
        </View>
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

/** A person as a dot and a name; the dot is filled when they are in. `name` is the accessible name, `label` what is shown when that reads differently, such as "You". */
export function PersonToggle({ name, label = name, on, onPress }: { name: string; label?: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const ink = on ? c.ink : c.muted;
  return (
    <PressTarget name={name} toggled={on} outsideScroll onPress={onPress} style={(pressed) => [styles.person, pressStyle(pressed, reduce, linkPress)]}>
      {() => (
        <View style={styles.personFace}>
          <View style={[styles.personDot, Platform.OS === "web" && inkChange, { backgroundColor: on ? ink : "transparent", boxShadow: `inset 0 0 0 1.5px ${on ? ink : c.dash}` }]} />
          <Text style={[type.body, Platform.OS === "web" && inkChange, { color: ink }]}>{label}</Text>
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
      {(pressed) => <Icon name={icon} size={size} color={dim || disabled ? c.dot : pressed ? c[pressedInk] : c.muted} />}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  labeled: { flex: 1, minWidth: 0 },
  moneyLabel: { textAlign: "right" },
  money: { flexDirection: "row", alignItems: "baseline", justifyContent: "flex-end", gap: unitGap, borderBottomWidth: 1, paddingVertical: 4 },
  // Holds the field's width at its text's; one pixel more keeps the caret in view.
  moneySizer: { opacity: 0, paddingRight: 1 },
  moneyInput: { position: "absolute", top: -11, bottom: -11, right: 0, textAlign: "right", paddingVertical: 11, paddingRight: 0 },
  prefixed: { flexDirection: "row", alignItems: "baseline", gap: unitGap, borderBottomWidth: 1 },
  prefixedInput: { flex: 1, borderBottomWidth: 0 },
  options: { flexDirection: "row", flexWrap: "wrap", columnGap: 20 },
  option: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, marginHorizontal: -12 },
  person: { minHeight: 44, justifyContent: "center", paddingRight: 18 },
  personFace: { flexDirection: "row", alignItems: "center", gap: 10 },
  // The same 12 px dot the list claims a line with, so a toggle here reads as the same act. It stays inside the name's cap height.
  personDot: { width: 12, height: 12, borderRadius: 6 },
  iconHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
