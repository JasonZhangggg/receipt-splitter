import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/button";
import { copy } from "../home-copy";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

export function SplitHeader({ onHistory, onShare }: { onHistory?: () => void; onShare?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.header}>
      <Text role="heading" aria-level={2} style={[type.wordmark, { color: c.ink }]}>
        {copy.wordmark}
      </Text>
      <View style={styles.buttons}>
        {onHistory ? <Button kind="icon" icon="history" name={say.history} onPress={onHistory} /> : null}
        {onShare ? <Button kind="icon" icon="share" name={say.shareLink} onPress={onShare} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 60, paddingTop: 6 },
  buttons: { flexDirection: "row", marginRight: -12 },
});
