import { StyleSheet, Text, View } from "react-native";

import { TextLink } from "../components/text-link";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

/** Under the intro links while the list shows another person's side. */
export function ViewingLine({ name, onBack }: { name: string; onBack: () => void }) {
  const c = useColors();
  return (
    <View testID="viewing" style={styles.box}>
      <Text style={[type.caption, { color: c.muted }]}>
        {say.viewingAs[0]}
        <Text style={{ color: c.ink }}>{name}</Text>
        {say.viewingAs[1]}
      </Text>
      <TextLink label={say.backToYou} onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, marginTop: 2, marginBottom: 6 },
});
