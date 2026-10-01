import { StyleSheet, Text, TextInput, View } from "react-native";

import type { PaymentService } from "../../core/split";
import { copy, paymentApps } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";
import { Button, PressTarget } from "./button";
import { Icon } from "./icon";

type Props = {
  service: PaymentService;
  onPickApp: () => void;
  onAddApp: () => void;
  outsideScroll?: boolean;
};

export function PaymentRow({ service, onPickApp, onAddApp, outsideScroll }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const app = paymentApps[service];
  return (
    <View style={styles.row}>
      <View style={[styles.field, { backgroundColor: c.sheetIn }]}>
        <PressTarget
          name={`${copy.paymentApp}, ${app.name}`}
          onPress={onPickApp}
          outsideScroll={outsideScroll}
          style={() => [styles.picker, { borderRightColor: c.hairline }]}
        >
          {(pressed) => (
            <View style={[styles.pickerFace, pressStyle(pressed, reduce)]}>
              <View style={[styles.glyph, { backgroundColor: c.ink }]}>
                <Text style={[type.glyph, { color: c.sheetIn }]}>{app.glyph}</Text>
              </View>
              <Text style={[type.body, { color: c.ink }]}>{app.name}</Text>
              <Icon name="chevron" size={16} color={c.muted} />
            </View>
          )}
        </PressTarget>
        <TextInput
          aria-label={`${app.name} handle`}
          placeholder={app.hint}
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          enterKeyHint="done"
          style={[type.body, styles.handle, { color: c.ink }]}
        />
      </View>
      <Button kind="outline" icon="plus" name={copy.addApp} onPress={onAddApp} outsideScroll={outsideScroll} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  field: { flex: 1, flexDirection: "row", alignItems: "stretch", minHeight: 52, borderRadius: 14, overflow: "hidden" },
  picker: { justifyContent: "center", paddingLeft: 12, paddingRight: 10, borderRightWidth: 1 },
  pickerFace: { flexDirection: "row", alignItems: "center", gap: 8 },
  glyph: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  handle: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 15 },
});
