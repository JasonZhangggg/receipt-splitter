import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={styles.screen}>
      <Text style={styles.label}>Split</Text>
      <Text style={styles.id} testID="split-id">
        {id}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, gap: 4 },
  label: { fontSize: 15, opacity: 0.6 },
  id: { fontSize: 28, fontWeight: "600" },
});
