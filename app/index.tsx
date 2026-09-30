import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { prefetchModel } from "../src/ocr";

export default function Home() {
  useEffect(prefetchModel, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.title} role="heading" aria-level={1}>
        Receipt Splitter
      </Text>
      <Text style={styles.body}>Split a bill from a photo of the receipt.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 34, fontWeight: "700", letterSpacing: -0.5 },
  body: { fontSize: 17, lineHeight: 24 },
});
