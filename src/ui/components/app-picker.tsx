import { StyleSheet, Text, View } from "react-native";

import type { PaymentService } from "../../core/split";
import { copy, paymentApps } from "../home-copy";
import { type, useColors } from "../theme";
import { PressTarget } from "./button";
import { Icon } from "./icon";

export type AppPickerProps = { service: PaymentService; choices: readonly PaymentService[]; onPick: (service: PaymentService) => void };

export function AppPicker({ service, choices, onPick }: AppPickerProps) {
  const c = useColors();
  const app = paymentApps[service];
  const next = choices[(choices.indexOf(service) + 1) % choices.length];
  return (
    <PressTarget name={`${copy.paymentApp}, ${app.name}`} onPress={() => onPick(next)} style={() => [styles.picker, { borderRightColor: c.hairline }]}>
      {() => (
        <View style={styles.face}>
          <View style={[styles.glyph, { backgroundColor: c.ink }]}>
            <Text style={[type.glyph, { color: c.paper }]}>{app.glyph}</Text>
          </View>
          <Text style={[type.body, { color: c.ink }]}>{app.name}</Text>
          <Icon name="chevron" size={16} color={c.muted} />
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  picker: { justifyContent: "center", paddingLeft: 17, paddingRight: 10, borderRightWidth: 1 },
  face: { flexDirection: "row", alignItems: "center", gap: 8 },
  glyph: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
