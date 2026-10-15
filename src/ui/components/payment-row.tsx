import type { RefObject } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { PAYMENT_SERVICES } from "../../core/split";
import type { DraftAction, HandleRow } from "../../draft";
import { copy, paymentApps } from "../home-copy";
import { type, useColors } from "../theme";
import { AppPicker } from "./app-picker";
import { Button } from "./button";
import { TextLink } from "./text-link";
import { UnderlineInput } from "./underline-input";

type Props = { handles: readonly HandleRow[]; dispatch: (action: DraftAction) => void; inputs?: RefObject<(TextInput | null)[]>; outsideScroll?: boolean };

/** One row per way to get paid: an app and the handle on it, with no labels, since the app's name and the placeholder say it. */
export function PaymentRows({ handles, dispatch, inputs, outsideScroll }: Props) {
  const c = useColors();
  const roomForMore = handles.length < PAYMENT_SERVICES.length;
  return (
    <View role="region" aria-label={copy.payHeading} style={styles.section}>
      <Text role="heading" aria-level={2} style={[type.title, { color: c.ink }]}>
        {copy.payHeading}
      </Text>
      {handles.map(({ service, handle }, index) => {
        const app = paymentApps[service];
        const choices = PAYMENT_SERVICES.filter((choice) => choice === service || !handles.some((row) => row.service === choice));
        return (
          <View key={service} style={styles.row}>
            <AppPicker service={service} choices={choices} onPick={(next) => dispatch({ type: "setService", index, service: next })} />
            <UnderlineInput
              ref={(input) => {
                if (inputs) inputs.current[index] = input;
              }}
              aria-label={`${app.name} handle`}
              value={handle}
              placeholder={app.hint}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              enterKeyHint="done"
              onChangeText={(text) => dispatch({ type: "setHandle", index, handle: text })}
              style={styles.handle}
            />
            {index > 0 ? <Button kind="icon" icon="x" name={copy.removeApp(app.name)} onPress={() => dispatch({ type: "removeHandle", index })} outsideScroll={outsideScroll} /> : null}
          </View>
        );
      })}
      {roomForMore ? <TextLink plus label={copy.addApp} onPress={() => dispatch({ type: "addHandle" })} outsideScroll={outsideScroll} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 4 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 16, marginTop: 8 },
  handle: { flex: 1 },
});
