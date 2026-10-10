import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import type { Participant, ParticipantId } from "../../core/split";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";
import { Dot } from "./dot";
import { LinkLine } from "./link-line";

export type PickRow = { readonly person: Participant; readonly picked: boolean };

type Props = {
  rows: readonly PickRow[];
  intro: { readonly lead: string; readonly rest: string; readonly strong?: string };
  chosen: ParticipantId | null;
  onPick: (id: ParticipantId, takeOver: boolean) => void;
  onAdd: (name: string) => Promise<string | null>;
  /** Absent where the pick content is part of the page, as in the desktop right pane. */
  onClose?: () => void;
  url: string;
};

export function PickSheet({ rows, intro, chosen, onPick, onAdd, onClose, url }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [typing, setTyping] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const join = async () => {
    const refused = await onAdd(typing ?? "");
    setProblem(refused);
  };

  return (
    <View pointerEvents={chosen === null ? "auto" : "none"} style={styles.sheet}>
      <View style={styles.topline}>
        <Text style={[type.body, styles.invite, { color: c.muted }]}>
          <Text style={[styles.strong, { color: c.ink }]}>{intro.lead}</Text>
          {intro.rest}
          {intro.strong ? <Text style={[styles.strong, { color: c.ink }]}>{intro.strong}</Text> : null}
        </Text>
        {onClose ? (
          <View style={styles.close}>
            <Button kind="icon" icon="x" name={say.closePick} onPress={onClose} outsideScroll />
          </View>
        ) : null}
      </View>
      <Text role="heading" aria-level={2} style={[type.title, styles.ask, { color: c.ink }]}>
        {say.question}
      </Text>
      <PickRows rows={rows} chosen={chosen} onPick={onPick} />
      {typing === null ? (
        <View>
          <PressTarget name={`${say.notHere} ${say.addYourself}`} outsideScroll onPress={() => setTyping("")} style={(pressed) => pressStyle(pressed, reduce)}>
            {() => (
              <View style={[styles.row, styles.notHere, { boxShadow: `inset 0 0 0 1px ${c.hairline}` }]}>
                <View style={[styles.ring, { backgroundColor: c.sheetIn }]}>
                  <Icon name="plus" size={16} color={c.ink} />
                </View>
                <Text style={[type.body, { color: c.ink }]}>
                  {say.notHere}
                  <Text style={{ color: c.muted }}>{`  ${say.addYourself}`}</Text>
                </Text>
              </View>
            )}
          </PressTarget>
        </View>
      ) : (
        <View style={styles.adding}>
          <TextInput
            autoFocus
            aria-label={say.yourName}
            placeholder={say.yourName}
            placeholderTextColor={c.muted}
            value={typing}
            autoCapitalize="words"
            enterKeyHint="go"
            onChangeText={setTyping}
            onSubmitEditing={join}
            submitBehavior="submit"
            blurOnSubmit={false}
            style={[type.input, styles.field, { color: c.ink, backgroundColor: c.sheetIn, boxShadow: `inset 0 0 0 1.5px ${c.ink}` }]}
          />
          {problem ? <Text style={[type.caption, styles.problem, { color: c.muted }]}>{problem}</Text> : null}
          <Button label={typing.trim() ? say.joinAs(typing.trim()) : say.yourName} disabled={!typing.trim()} onPress={join} outsideScroll />
        </View>
      )}
      <View style={styles.link}>
        <LinkLine url={url} />
      </View>
    </View>
  );
}

type RowsProps = Pick<Props, "rows" | "chosen" | "onPick">;

function PickRows({ rows, chosen, onPick }: RowsProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [asking, setAsking] = useState<ParticipantId | null>(null);
  return (
    <View role="list" style={styles.rows}>
        {rows.map(({ person, picked }) =>
          person.id === asking ? (
            <View key={person.id} role="listitem" style={[styles.claimback, { boxShadow: `inset 0 0 0 1.5px ${c.ink}` }]}>
              <View style={styles.rowLead}>
                <Dot name={person.name} size={32} tone="sheetIn" />
                <Text style={[type.body, { color: c.ink }]}>{person.name}</Text>
              </View>
              <Text style={[type.body, styles.indent, { color: c.muted }]}>{say.pickedElsewhere}</Text>
              <View style={[styles.two, styles.indent]}>
                <View style={styles.half}>
                  <Button label={say.thatsMe} onPress={() => onPick(person.id, true)} outsideScroll />
                </View>
                <View style={styles.half}>
                  <Button kind="soft" label={say.cancel} onPress={() => setAsking(null)} outsideScroll />
                </View>
              </View>
            </View>
          ) : (
            <View key={person.id} role="listitem">
              <PressTarget
                name={picked ? say.pickedName(person.name) : person.name}
                outsideScroll
                onPress={() => (picked ? setAsking(person.id) : onPick(person.id, false))}
                style={(pressed) => pressStyle(pressed, reduce)}
              >
                {() => {
                  const isChosen = person.id === chosen;
                  const fill = isChosen ? c.action : picked ? "transparent" : c.sheetIn;
                  const ink = isChosen ? c.onAction : picked ? c.muted : c.ink;
                  return (
                    <View style={[styles.row, { backgroundColor: fill, boxShadow: picked && !isChosen ? `inset 0 0 0 1px ${c.hairline}` : undefined }]}>
                      <View style={styles.rowLead}>
                        <Dot name={person.name} size={32} tone={isChosen ? "onAction" : picked ? "sheetIn" : "sheet"} />
                        <Text numberOfLines={1} style={[type.body, styles.name, { color: ink }]}>
                          {person.name}
                        </Text>
                      </View>
                      {isChosen ? <Icon name="check" size={20} color={c.onAction} /> : null}
                      {picked && !isChosen ? <Text style={[type.caption, { color: c.muted }]}>{say.picked}</Text> : null}
                    </View>
                  );
                }}
              </PressTarget>
            </View>
          ),
        )}
      </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: layout.blockGap },
  topline: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  invite: { flex: 1, marginTop: 2, marginLeft: 2 },
  strong: { fontWeight: "600" },
  close: { marginTop: -10, marginRight: -12 },
  ask: { marginHorizontal: 2, marginBottom: 4 },
  rows: { gap: layout.pairGap },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 58, paddingLeft: 13, paddingRight: 18, borderRadius: 16 },
  rowLead: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 },
  name: { flexShrink: 1 },
  claimback: { gap: 12, padding: 14, paddingLeft: 13, borderRadius: 16 },
  indent: { marginLeft: 44 },
  two: { flexDirection: "row", gap: layout.pairGap },
  half: { flex: 1 },
  notHere: { justifyContent: "flex-start", paddingLeft: 13 },
  ring: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  adding: { gap: 10 },
  link: { marginTop: 12 },
  field: { minHeight: layout.field, paddingHorizontal: 16, borderRadius: layout.fieldRadius },
  problem: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
