import { useId, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import type { Colors } from "../colors";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { motion, type, useColors } from "../theme";
import { Icon, type IconName } from "./icon";

const scrollViewTouchDelay = 150;

type TargetProps = {
  onPress: () => void;
  name?: string;
  outsideScroll?: boolean;
  disabled?: boolean;
  busy?: boolean;
  describedBy?: string;
  style: (pressed: boolean) => StyleProp<ViewStyle>;
  children: (pressed: boolean) => ReactNode;
};

export function PressTarget({ onPress, name, outsideScroll = false, disabled = false, busy, describedBy, style, children }: TargetProps) {
  const [held, setHeld] = useState(false);
  if (disabled && held) setHeld(false);
  const web = Platform.OS === "web" ? { dataSet: { pressable: "" }, delayPressIn: outsideScroll ? 0 : scrollViewTouchDelay } : {};
  return (
    <Pressable
      role="button"
      aria-label={name}
      aria-describedby={describedBy}
      aria-busy={busy}
      disabled={disabled}
      onPressIn={() => setHeld(!disabled)}
      onPressOut={() => setHeld(false)}
      onPress={() => {
        if (!disabled) onPress();
      }}
      {...web}
      style={() => style(held)}
    >
      {() => children(held)}
    </Pressable>
  );
}

type Tone = { fill?: string; ink: string; ring?: string };

const kinds = {
  primary: {
    face: { height: 54, paddingHorizontal: 24, borderRadius: 27 },
    label: type.button,
    icon: 20,
    tone: (c: Colors, disabled: boolean): Tone => (disabled ? { fill: c.off, ink: c.onOff } : { fill: c.action, ink: c.onAction }),
  },
  soft: {
    face: { height: 54, paddingHorizontal: 24, borderRadius: 27 },
    label: type.button,
    icon: 20,
    tone: (c: Colors): Tone => ({ fill: c.sheetIn, ink: c.ink }),
  },
  outline: { face: { width: 52, height: 52, borderRadius: 14 }, label: type.button, icon: 20, tone: (c: Colors): Tone => ({ ink: c.ink, ring: c.hairline }) },
  chip: {
    face: { height: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 22 },
    label: type.label,
    icon: 16,
    tone: (c: Colors): Tone => ({ ink: c.muted, ring: c.hairline }),
  },
  link: { face: { minHeight: 44, paddingHorizontal: 2 }, label: type.small, icon: 16, tone: (c: Colors): Tone => ({ ink: c.muted }) },
  icon: { face: { width: 44, height: 44 }, label: type.small, icon: 18, tone: (c: Colors): Tone => ({ ink: c.muted }) },
} satisfies Record<string, { face: ViewStyle; label: TextStyle; icon: number; tone: (c: Colors, disabled: boolean) => Tone }>;

type Props = ({ label: string; name?: string } | { label?: undefined; name: string }) & {
  onPress: () => void;
  kind?: keyof typeof kinds;
  icon?: IconName;
  outsideScroll?: boolean;
  disabled?: boolean;
  busy?: boolean;
  reason?: string;
};

const colorChange = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: "ease" });

export function Button({ label, onPress, kind = "primary", icon, name, outsideScroll, disabled = false, busy = false, reason }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const reasonId = useId();
  const variant = kinds[kind];
  const tone = variant.tone(c, disabled && !busy);
  const target = (
    <PressTarget
      onPress={onPress}
      name={name}
      outsideScroll={outsideScroll}
      disabled={disabled || busy}
      busy={busy}
      describedBy={reason ? reasonId : undefined}
      style={(pressed) => pressStyle(pressed, reduce)}
    >
      {() => (
        <View
          style={[
            styles.face,
            variant.face,
            Platform.OS === "web" && !reduce && colorChange,
            { backgroundColor: tone.fill, boxShadow: tone.ring && `inset 0 0 0 1px ${tone.ring}` },
          ]}
        >
          {busy && !reduce ? <View style={[styles.spinner, spin, { borderColor: tone.ink, borderRightColor: "transparent" }]} /> : null}
          {icon && !busy ? <Icon name={icon} size={variant.icon} color={tone.ink} /> : null}
          {label ? <Text style={[variant.label, { color: tone.ink }]}>{label}</Text> : null}
        </View>
      )}
    </PressTarget>
  );
  if (!reason) return target;
  return (
    <View style={styles.withReason}>
      <Text id={reasonId} style={[type.small, styles.reason, { backgroundColor: c.flagWash, color: c.flag }]}>
        {reason}
      </Text>
      {target}
    </View>
  );
}

const spin = webStyle({
  animationKeyframes: [{ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } }],
  animationDuration: `${motion.spinnerTurn}ms`,
  animationTimingFunction: "linear",
  animationIterationCount: "infinite",
});

const styles = StyleSheet.create({
  spinner: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  face: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  withReason: { gap: 10 },
  reason: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
