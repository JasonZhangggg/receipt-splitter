import { StyleSheet, View } from "react-native";

import { copy } from "../home-copy";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { motion, useColors } from "../theme";
import { useAppearanceFlip } from "../use-appearance-flip";
import { PressTarget } from "./button";
import { Icon } from "./icon";

const iconMark = { dataSet: { themeIcon: "" } };
const iconPress = { scale: 0.9, pressIn: 140 };

const swap = (reduce: boolean) =>
  webStyle({
    transitionProperty: reduce ? "opacity" : "transform, opacity",
    transitionDuration: reduce ? `${motion.reducedFade}ms` : "460ms, 200ms",
    transitionTimingFunction: reduce ? "ease" : "cubic-bezier(0.34, 1.56, 0.64, 1), ease",
  });

/** The sun/moon button. Its two icons trade places with a turn, and the new theme spreads from the button's center. */
export function ThemeToggle() {
  const c = useColors();
  const reduce = useReducedMotion();
  const { next, flip } = useAppearanceFlip();
  const dark = next === "light";
  const away = reduce ? {} : { transform: [{ rotate: "90deg" }, { scale: 0.4 }] };
  const awayBack = reduce ? {} : { transform: [{ rotate: "-90deg" }, { scale: 0.4 }] };
  return (
    <PressTarget name={copy.themeToggle[next]} onPress={(press) => flip(press.trigger)} style={(pressed) => [styles.target, pressStyle(pressed, reduce, iconPress)]}>
      {() => (
        <View style={styles.face}>
          <View {...iconMark} style={[styles.icon, swap(reduce), dark ? { opacity: 0, ...away } : { opacity: 1 }]}>
            <Icon name="sun" size={19} color={c.muted} />
          </View>
          <View {...iconMark} style={[styles.icon, swap(reduce), dark ? { opacity: 1 } : { opacity: 0, ...awayBack }]}>
            <Icon name="moon" size={18} color={c.muted} />
          </View>
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  target: { width: 44, height: 44, marginRight: -12 },
  face: { flex: 1, alignItems: "center", justifyContent: "center" },
  icon: { position: "absolute" },
});
