import { StyleSheet, Text } from "react-native";

import type { PaymentService } from "../../core/split";
import { copy, paymentApps } from "../home-copy";
import { useColors } from "../theme";
import { PressTarget } from "../components/button";

export type AppWordProps = { service: PaymentService; choices: readonly PaymentService[]; onPick: (service: PaymentService) => void };

/** Native: the app's name as an underlined word, and a tap steps to the next app that is still free. */
export function AppWord({ service, choices, onPick }: AppWordProps) {
  const c = useColors();
  const app = paymentApps[service];
  const next = choices[(choices.indexOf(service) + 1) % choices.length];
  return (
    <PressTarget name={`${copy.paymentApp}, ${app.name}`} onPress={() => onPick(next)} style={() => null}>
      {() => <Text style={[styles.name, { color: c.ink, borderBottomColor: c.ink }]}>{app.name}</Text>}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  name: { borderBottomWidth: 1.5, lineHeight: 25 },
});
