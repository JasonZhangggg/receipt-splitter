import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ParticipantId } from "../../core/split";
import { TextLink } from "../components/text-link";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors, useOnPage } from "../theme";
import { LinkLine } from "./link-line";
import { Line, type PersonRow } from "./people-sheet";
import { SheetHeader } from "./sheet-header";

type Props = {
  url: string;
  rows: readonly PersonRow[];
  chosen: ParticipantId | null;
  /** Why the last switch didn't take, or null. */
  problem: string | null;
  onPick: (id: ParticipantId) => void;
  onClose: () => void;
};

/** What the Host sees once Create link lands: the link with Copy and Share, then whose phone this is, with Switch for when it is someone else's. */
export function LinkReadySheet({ url, rows, chosen, problem, onPick, onClose }: Props) {
  const c = useColors();
  const onPage = useOnPage();
  const [switching, setSwitching] = useState(false);
  const mine = rows.find((row) => row.mine)?.person.name ?? "";
  return (
    <View pointerEvents={chosen === null ? "auto" : "none"} style={styles.sheet}>
      <SheetHeader title={say.linkReadyTitle} onClose={onClose} />
      <Text style={[type.body, styles.hint, { color: c.muted }]}>{say.linkReadyHint}</Text>
      <LinkLine url={url} />
      {rows.length > 1 ? (
        <View>
          <View style={styles.phone}>
            <Text style={[type.caption, styles.phoneIs, { color: c.muted }]}>{onPage ? say.computerIs(mine) : say.phoneIs(mine)}</Text>
            <TextLink label={switching ? say.cancel : say.switchAccount} onPress={() => setSwitching(!switching)} outsideScroll />
          </View>
          {switching ? (
            <View role="list">
              {rows.map((row) => (
                <View key={row.person.id} role="listitem">
                  <Line
                    row={row}
                    mode="switch"
                    asking={false}
                    host={row.host}
                    chosen={chosen}
                    onPress={() => {
                      if (!row.mine) onPick(row.person.id);
                      setSwitching(false);
                    }}
                  />
                </View>
              ))}
            </View>
          ) : null}
          {problem ? (
            <Text role="alert" style={[type.caption, { color: c.warn }]}>
              {problem}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: layout.blockGap },
  hint: { marginTop: -6 },
  phone: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  phoneIs: { flexShrink: 1 },
});
