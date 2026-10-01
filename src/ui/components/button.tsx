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

type KeyPress = { key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean };

const keyActivates = ({ key, altKey, ctrlKey, metaKey }: KeyPress) =>
  key === "Enter" ? !altKey && !ctrlKey && !metaKey : key === " " && !altKey;

const primaryHeld = ({ nativeEvent }: PointerEvent) => (nativeEvent.buttons & 1) === 1;

const inputOf = ({ nativeEvent }: GestureResponderEvent) => ("type" in nativeEvent ? nativeEvent.type : undefined);

const keyWithoutClick = (event: GestureResponderEvent) => inputOf(event) === "keydown" && !keyActivates(event.nativeEvent as unknown as KeyPress);

function usePressLook(outsideScroll: boolean, disabled: boolean) {
  const [look, setLook] = useState<Look>("rest");
  const tapUntil = useRef(0);
  const pointer = useRef<number | null>(null);
  const startedDisabled = useRef(false);
  const spaceHeld = useRef(false);
  if (disabled && look !== "rest") setLook("rest");
  useEffect(() => {
    const timed = timedLooks[look];
    if (!timed) return;
    const timer = setTimeout(() => setLook(timed.next), timed.after);
    return () => clearTimeout(timer);
  }, [look]);
  const rest = () => setLook("rest");
  const move = (from: Look, to: Look) => setLook((current) => (current === from ? to : current));
  const activates = () => {
    const refused = startedDisabled.current;
    startedDisabled.current = false;
    return !refused;
  };
  return {
    pressed: look === "pressed" || look === "tapped",
    activates,
    pressProps: {
      delayPressIn: 0,
      onPressIn: (event: GestureResponderEvent) => {
        startedDisabled.current = false;
        if (keyWithoutClick(event)) return;
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
        startedDisabled.current = disabled;
      },
      onPointerLeave: (event: PointerEvent) => {
        if (event.nativeEvent.pointerId === pointer.current && primaryHeld(event)) move("pressed", "away");
      },
      onPointerEnter: (event: PointerEvent) => {
        if (!disabled && primaryHeld(event)) move("away", "pressed");
      },
      onPointerCancel: rest,
      onBlur: () => {
        spaceHeld.current = false;
        rest();
      },
      onKeyDown: (event: KeyPress) => {
        if (disabled) return;
        if (event.code === "Space") spaceHeld.current = true;
        if (event.key === "Alt" && spaceHeld.current) rest();
        if (!keyActivates(event)) return;
        pointer.current = null;
        setLook("pressed");
      },
      onKeyUp: (event: KeyPress) => {
        if (event.code === "Space") spaceHeld.current = false;
        else if (event.key === "Alt" && spaceHeld.current && !disabled) setLook("pressed");
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
  const look = usePressLook(outsideScroll, disabled);
  const web = Platform.OS === "web";
  const webProps = web ? { dataSet: { pressable: "" }, ...look.pressProps } : {};
  const activate = () => {
    if (look.activates()) onPress();
  };
  return (
    <Pressable
      role="button"
      aria-label={name}
      aria-describedby={describedBy}
      disabled={disabled}
      onPress={activate}
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
    label: type.button,
    icon: 20,
    tone: (c: Colors, disabled: boolean): Tone => (disabled ? { fill: c.off, ink: c.onOff } : { fill: c.action, ink: c.onAction }),
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
  face: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  withReason: { gap: 10 },
  reason: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
