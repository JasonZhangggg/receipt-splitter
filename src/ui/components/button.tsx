import { useId, useRef, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import type { Colors } from "../colors";
import { pressStyle, useReducedMotion, webAnimation, webStyle } from "../motion";
import { motion, type, useColors } from "../theme";
import { openWithFallback } from "../open-link";
import { Icon, type IconName } from "./icon";

export const scrollViewTouchDelay = 150;

/** The control a press came from and whether a key made it, so a popover can hang from the control and skip its entrance for a key. */
export type Press = { readonly trigger: HTMLElement; readonly keyboard: boolean };

export type Action = { onPress: (press: Press) => void; href?: undefined; fallbackHref?: undefined } | { href: string; fallbackHref?: string; onPress?: undefined };

type TargetProps = Action & {
  name?: string;
  outsideScroll?: boolean;
  disabled?: boolean;
  busy?: boolean;
  describedBy?: string;
  toggled?: boolean;
  expanded?: boolean;
  popup?: "dialog";
  controls?: string;
  /** A press leaves focus where it is, so a focused field keeps the keyboard up. Keys and screen readers still press it. */
  keepsFocus?: boolean;
  style: (pressed: boolean) => StyleProp<ViewStyle>;
  children: (pressed: boolean) => ReactNode;
};

const newTab = { target: "_blank", rel: "noopener noreferrer" };

export function PressTarget({ onPress, keepsFocus = false, href, fallbackHref, name, outsideScroll = false, disabled = false, busy, describedBy, toggled, expanded, popup, controls, style, children }: TargetProps) {
  const [held, setHeld] = useState(false);
  const self = useRef<View>(null);
  if (disabled && held) setHeld(false);
  const web =
    Platform.OS === "web"
      ? {
          dataSet: { pressable: "" },
          delayPressIn: outsideScroll ? 0 : scrollViewTouchDelay,
          ...(href === undefined ? {} : { href, hrefAttrs: newTab }),
          // Focus moves in mousedown's default action, which iOS fires after the finger lifts. Preventing it keeps focus and still fires click.
          ...(keepsFocus ? { onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault() } : {}),
        }
      : {};
  return (
    <Pressable
      ref={self}
      role={href === undefined ? "button" : "link"}
      aria-label={name}
      aria-describedby={describedBy}
      aria-busy={busy}
      aria-pressed={toggled}
      aria-expanded={expanded}
      aria-haspopup={popup}
      aria-controls={controls}
      disabled={disabled}
      onPressIn={() => setHeld(!disabled)}
      onPressOut={() => setHeld(false)}
      onPress={(event) => {
        if (disabled) return;
        if (href === undefined) onPress({ trigger: self.current as unknown as HTMLElement, keyboard: pressedByKey(event) });
        else if (Platform.OS !== "web") void openWithFallback((url) => Linking.openURL(url), href, fallbackHref);
      }}
      {...web}
      style={() => style(held)}
    >
      {() => children(held)}
    </Pressable>
  );
}

// A role="button" target renders as a native <button>, so Enter and Space reach onPress as a click with detail 0, since no pointer clicked.
const pressedByKey = (event: GestureResponderEvent) => (event.nativeEvent as unknown as MouseEvent).detail === 0;

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
  expanded?: boolean;
  popup?: "dialog";
  reason?: string;
  note?: string;
  /** Looks off but still takes a press, so a tap can show what is missing. */
  blocked?: boolean;
};

const colorChange = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: "ease" });

export function Button({ label, kind = "primary", icon, glyph, name, outsideScroll, disabled = false, busy = false, expanded, popup, reason, note, blocked = false, ...action }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const reasonId = useId();
  const variant = kinds[kind];
  const tone = variant.tone(c, (disabled || blocked) && !busy);
  const target = (
    <PressTarget
      {...action}
      name={name}
      outsideScroll={outsideScroll}
      disabled={disabled || busy}
      busy={busy}
      expanded={expanded}
      popup={popup}
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
          {glyph ? <Mark glyph={glyph} ink={tone.ink} fill={tone.fill} /> : null}
          {label ? <Text style={[variant.label, { color: tone.ink }]}>{label}</Text> : null}
        </View>
      )}
    </PressTarget>
  );
  if (!reason && !note) return target;
  return (
    <View style={styles.withReason}>
      <Text id={reasonId} style={[type.small, styles.reason, { color: c.muted }]}>
        {reason || note}
      </Text>
      {target}
    </View>
  );
}

const spin = webAnimation({
  animationKeyframes: [{ from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } }],
  animationDuration: `${motion.spinnerTurn}ms`,
  animationTimingFunction: "linear",
  animationIterationCount: "infinite",
});

/** An app's letter in a circle, drawn in the control's ink with the letter cut out in its fill. */
export function Mark({ glyph, ink, fill }: { glyph: string; ink: string; fill?: string }) {
  return (
    <View style={[styles.glyph, { backgroundColor: ink }]}>
      <Text style={[type.glyph, { color: fill }]}>{glyph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  face: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  glyph: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 4 },
  withReason: { gap: 10 },
  reason: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
