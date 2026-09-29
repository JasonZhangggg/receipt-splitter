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
    <View style={[styles.row, { borderBottomColor: c.hairline }, flagged && { backgroundColor: c.flagWash }, style]}>
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
    paddingHorizontal: space.s,
    marginHorizontal: -space.s,
    borderBottomWidth: 1,
  },
  text: { flex: 1 },
});
