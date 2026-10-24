import { StyleSheet, Text, View } from "react-native";

import type { PaymentService } from "../../core/split";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { copy, paymentApps } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";

/** As wide as the Split page's menus. */
export const appMenuWidth = 264;

type Props = {
  service: PaymentService;
  /** The apps this clause can switch to: its own and those no other clause uses. */
  choices: readonly PaymentService[];
  /** How many ways to pay the sentence has, or null when every app is taken and none can be added. */
  adding: number | null;
  onPick: (service: PaymentService) => void;
  onAdd: () => void;
};

/** The app menu under an app's name: each app with a tick on this clause's, then, under a hairline, the row that adds another way to pay. */
export function AppMenu({ service, choices, adding, onPick, onAdd }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const add = adding === 1 ? copy.addSecondApp : copy.addAnotherApp;
  return (
    <View>
      {choices.map((one) => (
        <PressTarget key={one} name={paymentApps[one].name} toggled={one === service} outsideScroll onPress={() => onPick(one)} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
          {(pressed) => (
            <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
              <View style={styles.tick}>{one === service ? <Icon name="chosen" size={14} color={c.ink} /> : null}</View>
              <Text numberOfLines={1} style={[type.body, styles.label, { color: c.ink }]}>
                {paymentApps[one].name}
              </Text>
            </View>
          )}
        </PressTarget>
      ))}
      {adding === null ? null : (
        <>
          <View style={[styles.rule, { backgroundColor: c.hairline }]} />
          <PressTarget name={add} outsideScroll onPress={onAdd} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
            {(pressed) => (
              <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
                <View style={styles.tick}>
                  <Icon name="plus" size={14} color={c.ink} />
                </View>
                <Text numberOfLines={1} style={[type.body, styles.label, { color: c.ink }]}>
                  {add}
                </Text>
              </View>
            )}
          </PressTarget>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 14 },
  tick: { width: 14, alignItems: "center" },
  label: { flex: 1 },
  rule: { height: 1, marginVertical: 6, marginHorizontal: 12 },
});
