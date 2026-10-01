import { StyleSheet, Text, View } from "react-native";

import { plainAmount } from "../../draft";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

/** "You owe $12.05" with a chevron that opens your breakdown, per frame F. */
export function OweLine({ label, amount, onPress }: { label: string; amount: number; onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={`${label} $${plainAmount(amount)}, ${say.showBreakdown}`} outsideScroll onPress={onPress} style={(pressed) => pressStyle(pressed, reduce)}>
      {() => (
        <View style={styles.line}>
          <Text style={[type.button, { color: c.ink }]}>{label}</Text>
          <View style={styles.end}>
            <Text testID="owe" style={[type.total, styles.amount, { color: c.ink }]}>{`$${plainAmount(amount)}`}</Text>
            <View style={styles.chevron}>
              <Icon name="chevron" size={18} color={c.muted} />
            </View>
          </View>
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, paddingHorizontal: 2 },
  end: { flexDirection: "row", alignItems: "center", gap: 4 },
  amount: { fontVariant: ["tabular-nums"] },
  chevron: { transform: [{ rotate: "180deg" }] },
});
