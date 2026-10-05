import type { RefObject } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { PAYMENT_SERVICES } from "../../core/split";
import type { DraftAction, HandleRow } from "../../draft";
import { copy, paymentApps } from "../home-copy";
import { fieldGroup } from "../document";
import { layout, type, useColors } from "../theme";
import { AppPicker } from "./app-picker";
import { Button } from "./button";

type Props = { handles: readonly HandleRow[]; dispatch: (action: DraftAction) => void; inputs?: RefObject<(TextInput | null)[]>; outsideScroll?: boolean };

export function PaymentRows({ handles, dispatch, inputs, outsideScroll }: Props) {
  const c = useColors();
  const roomForMore = handles.length < PAYMENT_SERVICES.length;
  return (
    <View style={styles.rows}>
      {handles.map(({ service, handle }, index) => {
        const app = paymentApps[service];
        const choices = PAYMENT_SERVICES.filter((choice) => choice === service || !handles.some((row) => row.service === choice));
        return (
          <View key={service} style={styles.row}>
            <View {...fieldGroup} style={[styles.field, { backgroundColor: c.sheetIn }]}>
              <AppPicker service={service} choices={choices} onPick={(next) => dispatch({ type: "setService", index, service: next })} />
              <TextInput
                ref={(input) => {
                  if (inputs) inputs.current[index] = input;
                }}
                aria-label={`${app.name} handle`}
                value={handle}
                placeholder={app.hint}
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                enterKeyHint="done"
                onChangeText={(text) => dispatch({ type: "setHandle", index, handle: text })}
                style={[type.input, styles.handle, { color: c.ink }]}
              />
            </View>
            {index > 0 ? (
              <Button kind="outline" icon="x" name={copy.removeApp(app.name)} onPress={() => dispatch({ type: "removeHandle", index })} outsideScroll={outsideScroll} />
            ) : roomForMore ? (
              <Button kind="outline" icon="plus" name={copy.addApp} onPress={() => dispatch({ type: "addHandle" })} outsideScroll={outsideScroll} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: layout.pairGap },
  row: { flexDirection: "row", gap: layout.pairGap },
  field: { flex: 1, flexDirection: "row", alignItems: "stretch", minHeight: layout.field, borderRadius: layout.fieldRadius, overflow: "hidden" },
  handle: { flex: 1, minWidth: 0, paddingHorizontal: 14 },
});
