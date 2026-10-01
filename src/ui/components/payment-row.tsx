import { StyleSheet, TextInput, View } from "react-native";

import { PAYMENT_SERVICES } from "../../core/split";
import type { DraftAction, HandleRow } from "../../draft";
import { copy, paymentApps } from "../home-copy";
import { type, useColors } from "../theme";
import { AppPicker } from "./app-picker";
import { Button } from "./button";

type Props = { handles: readonly HandleRow[]; dispatch: (action: DraftAction) => void; outsideScroll?: boolean };

export function PaymentRows({ handles, dispatch, outsideScroll }: Props) {
  const c = useColors();
  const roomForMore = handles.length < PAYMENT_SERVICES.length;
  return (
    <View style={styles.rows}>
      {handles.map(({ service, handle }, index) => {
        const app = paymentApps[service];
        const choices = PAYMENT_SERVICES.filter((choice) => choice === service || !handles.some((row) => row.service === choice));
        return (
          <View key={service} style={styles.row}>
            <View style={[styles.field, { backgroundColor: c.sheetIn }]}>
              <AppPicker service={service} choices={choices} onPick={(next) => dispatch({ type: "setService", index, service: next })} />
              <TextInput
                aria-label={`${app.name} handle`}
                value={handle}
                placeholder={app.hint}
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                enterKeyHint="done"
                onChangeText={(text) => dispatch({ type: "setHandle", index, handle: text })}
                style={[type.body, styles.handle, { color: c.ink }]}
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
  rows: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  field: { flex: 1, flexDirection: "row", alignItems: "stretch", minHeight: 52, borderRadius: 14, overflow: "hidden" },
  handle: { flex: 1, minWidth: 0, paddingHorizontal: 14 },
});
