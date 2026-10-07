import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { PaymentService } from "../../core/split";
import { PressTarget } from "../components/button";
import { paymentApps } from "../home-copy";
import { switcherWidth } from "./switcher";

export type MethodPickerProps = { service: PaymentService; choices: readonly PaymentService[]; onPick: (service: PaymentService) => void; name: string; children: ReactNode };

export function MethodPicker({ service, choices, onPick, name, children }: MethodPickerProps) {
  const next = choices[(choices.indexOf(service) + 1) % choices.length];
  return (
    <View style={styles.over}>
      <PressTarget name={`${name}, ${paymentApps[service].name}`} onPress={() => onPick(next)} outsideScroll style={() => styles.face}>
        {() => <View style={styles.unseen}>{children}</View>}
      </PressTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  over: { position: "absolute", top: 0, right: 0, bottom: 0, width: switcherWidth },
  face: { width: switcherWidth, flex: 1 },
  unseen: { opacity: 0 },
});
