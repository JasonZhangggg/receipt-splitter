import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PointerEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import type { Colors } from "../colors";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { motion, type, useColors } from "../theme";
import { Icon, type IconName } from "./icon";

type Look = "rest" | "waiting" | "pressed" | "away" | "tapped";

const scrollViewTouchDelay = 150;
const tapLook = motion.pressIn;

const timedLooks: Partial<Record<Look, { after: number; next: Look }>> = {
  waiting: { after: scrollViewTouchDelay, next: "pressed" },
  tapped: { after: tapLook, next: "rest" },
};

const pressKeys = new Set([" ", "Enter"]);

const primaryHeld = ({ nativeEvent }: PointerEvent) => (nativeEvent.buttons & 1) === 1;

const inputOf = ({ nativeEvent }: GestureResponderEvent) => ("type" in nativeEvent ? nativeEvent.type : undefined);

const commandKey = (event: GestureResponderEvent) => inputOf(event) === "keydown" && "metaKey" in event.nativeEvent && event.nativeEvent.metaKey === true;

function usePressLook(outsideScroll: boolean) {
  const [look, setLook] = useState<Look>("rest");
  const tapUntil = useRef(0);
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    const timed = timedLooks[look];
    if (!timed) return;
    const timer = setTimeout(() => setLook(timed.next), timed.after);
    return () => clearTimeout(timer);
  }, [look]);
  const rest = () => setLook("rest");
  const move = (from: Look, to: Look) => setLook((current) => (current === from ? to : current));
  return {
    pressed: look === "pressed" || look === "tapped",
    pressProps: {
      delayPressIn: 0,
      onPressIn: (event: GestureResponderEvent) => {
        if (commandKey(event)) return;
        const touch = inputOf(event) === "touchstart";
        if (touch && event.nativeEvent.touches.length > 1) return;
        const waits = touch && !outsideScroll;
        tapUntil.current = waits ? performance.now() + scrollViewTouchDelay + tapLook : 0;
        setLook(waits ? "waiting" : "pressed");
      },
      onPressOut: () => {
        const tap = performance.now() < tapUntil.current;
        setLook((current) => (current !== "rest" && tap ? "tapped" : "rest"));
      },
      onPointerDown: (event: PointerEvent) => {
        pointer.current = event.nativeEvent.pointerId;
      },
      onPointerLeave: (event: PointerEvent) => {
        if (event.nativeEvent.pointerId === pointer.current && primaryHeld(event)) move("pressed", "away");
      },
      onPointerEnter: () => move("away", "pressed"),
      onPointerCancel: rest,
      onBlur: rest,
      onKeyDown: (event: { key: string; metaKey: boolean }) => {
        if (!pressKeys.has(event.key) || event.metaKey) return;
        pointer.current = null;
        setLook("pressed");
      },
    },
  };
}

type TargetProps = {
  onPress: () => void;
  name?: string;
  outsideScroll?: boolean;
  disabled?: boolean;
  describedBy?: string;
  style: (pressed: boolean) => StyleProp<ViewStyle>;
  children: (pressed: boolean) => ReactNode;
};

export function PressTarget({ onPress, name, outsideScroll = false, disabled = false, describedBy, style, children }: TargetProps) {
  const look = usePressLook(outsideScroll);
  const web = Platform.OS === "web";
  const webProps = web ? { dataSet: { pressable: "" }, ...look.pressProps } : {};
  return (
    <Pressable
      role="button"
      aria-label={name}
      aria-describedby={describedBy}
      disabled={disabled}
      onPress={onPress}
      {...webProps}
      style={({ pressed }) => style(web ? look.pressed : pressed)}
    >
      {({ pressed }) => children(web ? look.pressed : pressed)}
    </Pressable>
  );
}

type Tone = { fill?: string; ink: string; ring?: string };

const kinds = {
  primary: {
    face: { height: 54, paddingHorizontal: 24, borderRadius: 27 },
    stretch: true,
    label: type.button,
    icon: 20,
    tone: (c: Colors, disabled: boolean): Tone => (disabled ? { fill: c.off, ink: c.onOff } : { fill: c.action, ink: c.onAction }),
  },
  outline: { face: { width: 52, height: 52, borderRadius: 14 }, stretch: false, label: type.button, icon: 20, tone: (c: Colors): Tone => ({ ink: c.ink, ring: c.hairline }) },
  chip: {
    face: { height: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 22 },
    stretch: false,
    label: type.label,
    icon: 16,
    tone: (c: Colors): Tone => ({ ink: c.muted, ring: c.hairline }),
  },
  link: { face: { minHeight: 44, paddingHorizontal: 2 }, stretch: false, label: type.small, icon: 16, tone: (c: Colors): Tone => ({ ink: c.muted }) },
  icon: { face: { width: 44, height: 44 }, stretch: false, label: type.small, icon: 18, tone: (c: Colors): Tone => ({ ink: c.muted }) },
} satisfies Record<string, { face: ViewStyle; stretch: boolean; label: TextStyle; icon: number; tone: (c: Colors, disabled: boolean) => Tone }>;

type Props = ({ label: string; name?: string } | { label?: undefined; name: string }) & {
  onPress: () => void;
  kind?: keyof typeof kinds;
  icon?: IconName;
  outsideScroll?: boolean;
  disabled?: boolean;
  reason?: string;
};

const colorChange = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.actionColor}ms`, transitionTimingFunction: "ease" });

export function Button({ label, onPress, kind = "primary", icon, name, outsideScroll, disabled = false, reason }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const reasonId = useId();
  const variant = kinds[kind];
  const tone = variant.tone(c, disabled);
  const target = (
    <PressTarget
      onPress={onPress}
      name={name}
      outsideScroll={outsideScroll}
      disabled={disabled}
      describedBy={reason ? reasonId : undefined}
      style={(pressed) => [styles.target, variant.stretch && styles.stretch, pressStyle(pressed, reduce)]}
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
          {icon ? <Icon name={icon} size={variant.icon} color={tone.ink} /> : null}
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

const styles = StyleSheet.create({
  target: { alignSelf: "flex-start" },
  stretch: { alignSelf: "stretch" },
  face: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  withReason: { alignSelf: "stretch", gap: 10 },
  reason: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
