import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/button";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

export const claimConfirmWidth = 300;

/** Asks before a circle tap checks or unchecks an Item for someone other than this device's person. */
export function ClaimConfirm({ question, action, onYes, onNo }: { question: string; action: string; onYes: () => void; onNo: () => void }) {
  const c = useColors();
  return (
    <View style={styles.box}>
      <Text style={[type.secondary, styles.question, { color: c.ink }]}>{question}</Text>
      <View style={styles.two}>
        <View style={styles.half}>
          <Button label={action} onPress={onYes} outsideScroll />
        </View>
        <View style={styles.half}>
          <Button kind="soft" label={say.cancel} onPress={onNo} outsideScroll />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, padding: 8 },
  question: { paddingHorizontal: 4, paddingTop: 2 },
  two: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
});
