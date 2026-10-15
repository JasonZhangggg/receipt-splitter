import { StyleSheet, Text, View } from "react-native";

import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { TextLink } from "../components/text-link";
import { copy } from "../home-copy";
import { pressFeel, pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";
import { DropCard } from "./drop-card";

const pressFace = { dataSet: { pressFace: "" } };
const paperLines = ["72%", "52%", "64%", "40%", "58%"] as const;

type Props = { onChoose: () => void; over: boolean; wide: boolean };

/** The empty state: a paper drawing with a round camera button on it, and a quiet way to choose a file. */
export function TakePhoto({ onChoose, over, wide }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <DropCard over={over} padded={false}>
      <View style={styles.card}>
        <PressTarget name={copy.hero.title} onPress={onChoose} style={(pressed) => [styles.shoot, pressStyle(pressed, reduce, pressFeel.slip)]}>
          {() => (
            <View {...pressFace} style={styles.face}>
              <View style={[styles.paper, { backgroundColor: c.hairline }]}>
                {paperLines.map((width) => (
                  <View key={width} style={[styles.line, { width, backgroundColor: c.dot }]} />
                ))}
              </View>
              <View style={[styles.camera, { backgroundColor: c.ink, boxShadow: `0 0 0 5px ${c.field}` }]}>
                <Icon name="camera" size={26} color={c.field} />
              </View>
              <Text style={[type.title, styles.title, { color: c.ink }]}>{copy.hero.title}</Text>
            </View>
          )}
        </PressTarget>
        {wide ? <Text style={[type.caption, { color: c.muted }]}>{copy.hero.drop}</Text> : null}
        <View style={styles.file}>
          <TextLink label={copy.hero.file} onPress={onChoose} />
        </View>
      </View>
    </DropCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", gap: 6, paddingTop: 30, paddingBottom: 14, paddingHorizontal: 20 },
  shoot: { alignItems: "center", borderRadius: 14 },
  face: { alignItems: "center", borderRadius: 14 },
  paper: { width: 112, height: 138, borderRadius: 10, paddingVertical: 20, paddingHorizontal: 18, gap: 9 },
  file: { alignSelf: "center" },
  line: { height: 3, borderRadius: 2 },
  camera: { width: 60, height: 60, marginTop: -34, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  title: { marginTop: 22, fontSize: 18, lineHeight: 26, letterSpacing: -0.18 },
});
