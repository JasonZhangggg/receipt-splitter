import { StyleSheet, Text, View } from "react-native";

import type { PaymentService } from "../../core/split";
import { copy, paymentApps } from "../home-copy";
import { type, useColors } from "../theme";
import { PressTarget } from "./button";
import { Icon } from "./icon";

export type AppPickerProps = { service: PaymentService; choices: readonly PaymentService[]; onPick: (service: PaymentService) => void };

/** Native: a tap steps to the next app that is still free. */
export function AppPicker({ service, choices, onPick }: AppPickerProps) {
  const c = useColors();
  const app = paymentApps[service];
  const next = choices[(choices.indexOf(service) + 1) % choices.length];
  return (
    <PressTarget name={`${copy.paymentApp}, ${app.name}`} onPress={() => onPick(next)} style={() => [styles.picker, { borderBottomColor: c.hairline }]}>
      {() => (
        <View style={styles.face}>
          <Text style={[type.input, { color: c.ink }]}>{app.name}</Text>
          <Icon name="chevron" size={12} color={c.muted} />
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  picker: { justifyContent: "center", paddingVertical: 4, borderBottomWidth: 1 },
  face: { flexDirection: "row", alignItems: "center", gap: 8 },
});
