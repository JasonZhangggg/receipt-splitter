import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Native } from "./native";
import { Slip } from "./slip";
import { Table } from "./table";

const directions = {
  a: { label: "A Slip", Screen: Slip },
  b: { label: "B Native", Screen: Native },
  c: { label: "C Table", Screen: Table },
};
type Key = keyof typeof directions;
const keys = Object.keys(directions) as Key[];

export function DirectionSwitcher() {
  const params = useLocalSearchParams<{ d?: string; chrome?: string }>();
  const current: Key = keys.includes(params.d as Key) ? (params.d as Key) : "a";
  const { Screen } = directions[current];

  return (
    <View style={styles.fill}>
      <Screen key={current} />
      {params.chrome === "off" ? null : (
        <View style={styles.switcher} aria-label="Prototype direction">
          {keys.map((key) => (
            <Pressable
              key={key}
              role="button"
              aria-pressed={key === current}
              onPress={() => router.setParams({ d: key })}
              style={[styles.option, key === current && styles.active]}
            >
              <Text style={[styles.optionText, key === current && styles.activeText]}>{directions[key].label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  switcher: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    padding: 3,
    gap: 2,
    borderRadius: 10,
    backgroundColor: "rgba(20, 20, 20, 0.86)",
  },
  option: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  active: { backgroundColor: "#FFFFFF" },
  optionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  activeText: { color: "#141414" },
});
