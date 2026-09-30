import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { space, type, useColors } from "../theme";

type Props = {
  title: string;
  note?: string;
  trailing?: ReactNode;
  flagged?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ListRow({ title, note, trailing, flagged = false, style }: Props) {
  const c = useColors();
  const tone = flagged ? c.flag : c.ink;
  return (
    <View style={[styles.row, { borderBottomColor: c.hairline }, style]}>
      {flagged ? <View style={[styles.wash, { backgroundColor: c.flagWash }]} /> : null}
      <View style={styles.text}>
        <Text style={[type.body, { color: tone }]}>{title}</Text>
        {note ? <Text style={[type.small, { color: tone }]}>{note}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: 56,
    paddingVertical: space.m,
    borderBottomWidth: 1,
  },
  wash: { position: "absolute", top: 0, bottom: 0, left: -space.s, right: -space.s },
  text: { flex: 1 },
});
