import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button, PressTarget, type Press } from "../components/button";
import { Icon, type IconName } from "../components/icon";
import { copy, joinCopy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";

type Props = { onMore?: (press: Press) => void; moreOpen?: boolean; onShare?: () => void };

export function SplitHeader({ onMore, moreOpen = false, onShare }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={styles.header}>
      <View role="heading" aria-level={1}>
        <PressTarget name={joinCopy.wordmarkHome} onPress={() => router.push("/")} style={(pressed) => [styles.home, pressStyle(pressed, reduce)]}>
          {() => <Text style={[type.title, { color: c.ink }]}>{copy.wordmark}</Text>}
        </PressTarget>
      </View>
      <View style={styles.buttons}>
        {onMore ? <Button kind="icon" icon="more" name={say.more} popup="dialog" expanded={moreOpen} onPress={onMore} /> : null}
        {onShare ? <Button kind="icon" icon="share" name={say.shareLink} onPress={onShare} /> : null}
      </View>
    </View>
  );
}

export const headerMenuWidth = 220;

/** What the header's More button holds: Payments first, since it is the one people open to check on something, then the receipt photo while the Split has one, and History. */
export function HeaderMenu({ onPayments, onPhoto, onHistory }: { onPayments: (press: Press) => void; onPhoto?: (press: Press) => void; onHistory: (press: Press) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const rows: { icon: IconName; label: string; onPress: (press: Press) => void }[] = [
    { icon: "check", label: say.payments, onPress: onPayments },
    ...(onPhoto ? [{ icon: "receipt" as const, label: say.receiptPhotoItem, onPress: onPhoto }] : []),
    { icon: "history", label: say.history, onPress: onHistory },
  ];
  return (
    <View>
      {rows.map(({ icon, label, onPress }) => (
        <PressTarget key={icon} name={label} outsideScroll onPress={onPress} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
          {(pressed) => (
            <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
              <Icon name={icon} size={20} color={c.ink} />
              <Text numberOfLines={1} style={[type.body, styles.label, { color: c.ink }]}>
                {label}
              </Text>
            </View>
          )}
        </PressTarget>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: layout.header, paddingTop: 6 },
  buttons: { flexDirection: "row", alignItems: "center", marginRight: -12 },
  home: { minHeight: 44, justifyContent: "center" },
  press: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingHorizontal: 12, borderRadius: 14 },
  label: { flexShrink: 1 },
});
