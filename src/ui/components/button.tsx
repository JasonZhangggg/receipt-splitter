import { useId, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import type { Colors } from "../colors";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { motion, type, useColors } from "../theme";
import { openWithFallback } from "../open-link";
import { Icon, type IconName } from "./icon";

const scrollViewTouchDelay = 150;

export type Action = { onPress: () => void; href?: undefined; fallbackHref?: undefined } | { href: string; fallbackHref?: string; onPress?: undefined };

type TargetProps = Action & {
  name?: string;
  outsideScroll?: boolean;
  disabled?: boolean;
  busy?: boolean;
  describedBy?: string;
  toggled?: boolean;
  expanded?: boolean;
  controls?: string;
  style: (pressed: boolean) => StyleProp<ViewStyle>;
  children: (pressed: boolean) => ReactNode;
};

const newTab = { target: "_blank", rel: "noopener noreferrer" };

export function PressTarget({ onPress, href, fallbackHref, name, outsideScroll = false, disabled = false, busy, describedBy, toggled, expanded, controls, style, children }: TargetProps) {
  const [held, setHeld] = useState(false);
  if (disabled && held) setHeld(false);
  const web = Platform.OS === "web" ? { dataSet: { pressable: "" }, delayPressIn: outsideScroll ? 0 : scrollViewTouchDelay, ...(href === undefined ? {} : { href, hrefAttrs: newTab }) } : {};
  return (
    <Pressable
      role={href === undefined ? "button" : "link"}
      aria-label={name}
      aria-describedby={describedBy}
      aria-busy={busy}
      aria-pressed={toggled}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      onPressIn={() => setHeld(!disabled)}
      onPressOut={() => setHeld(false)}
      onPress={() => {
        if (disabled) return;
        if (href === undefined) onPress();
        else if (Platform.OS !== "web") void openWithFallback((url) => Linking.openURL(url), href, fallbackHref);
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
  outline: { face: { width: 54, height: 54, borderRadius: 16 }, label: type.button, icon: 20, tone: (c: Colors): Tone => ({ ink: c.ink, ring: c.hairline }) },
  chip: {
    face: { height: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 22 },
    label: type.label,
    icon: 16,
    tone: (c: Colors): Tone => ({ ink: c.muted, ring: c.hairline }),
  },
  link: { face: { minHeight: 44, paddingHorizontal: 2 }, label: type.small, icon: 16, tone: (c: Colors): Tone => ({ ink: c.muted }) },
  icon: { face: { width: 44, height: 44 }, label: type.small, icon: 18, tone: (c: Colors): Tone => ({ ink: c.muted }) },
  onPhoto: { face: { width: 44, height: 44, borderRadius: 22 }, label: type.small, icon: 18, tone: (): Tone => ({ fill: "rgba(255, 255, 255, 0.14)", ink: "#FFFFFF" }) },
  overPhoto: { face: { width: 44, height: 44, borderRadius: 22 }, label: type.small, icon: 18, tone: (): Tone => ({ fill: "rgba(255, 255, 255, 0.9)", ink: "#111214" }) },
} satisfies Record<string, { face: ViewStyle; label: TextStyle; icon: number; tone: (c: Colors, disabled: boolean) => Tone }>;

type Props = ({ label: string; name?: string } | { label?: undefined; name: string }) &
  Action & {
  kind?: keyof typeof kinds;
  icon?: IconName;
  glyph?: string;
  outsideScroll?: boolean;
  disabled?: boolean;
  busy?: boolean;
  reason?: string;
  note?: string;
};

const colorChange = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: "ease" });

export function Button({ label, kind = "primary", icon, glyph, name, outsideScroll, disabled = false, busy = false, reason, note, ...action }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const reasonId = useId();
  const variant = kinds[kind];
  const tone = variant.tone(c, disabled && !busy);
  const target = (
    <PressTarget
      {...action}
      name={name}
      outsideScroll={outsideScroll}
      disabled={disabled || busy}
      busy={busy}
      describedBy={reason || note ? reasonId : undefined}
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
          {glyph ? (
            <View style={[styles.glyph, { backgroundColor: tone.ink }]}>
              <Text style={[type.glyph, { color: tone.fill }]}>{glyph}</Text>
            </View>
          ) : null}
          {label ? <Text style={[variant.label, { color: tone.ink }]}>{label}</Text> : null}
        </View>
      )}
    </PressTarget>
  );
  if (!reason && !note) return target;
  return (
    <View style={styles.withReason}>
      <Text id={reasonId} style={[type.small, styles.reason, reason ? { backgroundColor: c.flagWash, color: c.flag } : { color: c.muted }]}>
        {reason || note}
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
  glyph: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 4 },
  withReason: { gap: 10 },
  reason: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
