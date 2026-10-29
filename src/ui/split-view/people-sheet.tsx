import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Participant, ParticipantId } from "../../core/split";
import { Button, PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { typedName } from "../components/name-case";
import { TextLink } from "../components/text-link";
import { UnderlineInput } from "../components/underline-input";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { KeptRows, useEntering } from "../presence";
import { splitCopy as say } from "../split-copy";
import { layout, motion, tabular, type, useColors, useOnPage } from "../theme";
import { LinkLine } from "./link-line";
import { Pinned, SheetHeader } from "./sheet-header";

export type PersonRow = {
  readonly person: Participant;
  /** The money amount shown with the name. */
  readonly share: string;
  readonly mine: boolean;
  readonly viewed: boolean;
  /** Another phone holds this name. */
  readonly heldElsewhere: boolean;
};

export type Mode = "view" | "switch" | "remove";

type Props = {
  rows: readonly PersonRow[];
  /** This phone's name. Null while it has none, which makes the sheet ask "Which one are you?". */
  meName: string | null;
  intro: { readonly lead: string; readonly rest: string; readonly strong?: string };
  chosen: ParticipantId | null;
  onView: (id: ParticipantId) => void;
  onPick: (id: ParticipantId, takeOver: boolean) => void;
  /** Returns why the name was not added, or null. Asking adds the name and picks it. */
  onAdd: (name: string) => Promise<string | null>;
  onRemove: (id: ParticipantId, press: Press) => void;
  onClose: () => void;
  url: string;
};

const colorFade = webStyle({ transitionProperty: "color", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });
const dotFade = webStyle({ transitionProperty: "background-color, box-shadow", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });

/** Everyone in the Split with their share. A tap shows the list from that person's side. The same sheet asks "Which one are you?" while this phone has no name. */
export function PeopleSheet({ rows, meName, intro, chosen, onView, onPick, onAdd, onRemove, onClose, url }: Props) {
  const c = useColors();
  const onPage = useOnPage();
  const asking = meName === null;
  const [mode, setMode] = useState<Mode>("view");
  const [held, setHeld] = useState<ParticipantId | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const picking = asking || mode === "switch";
  // A person who joins, from this sheet or another phone, grows into the list, and one who is removed collapses out where they stood.
  const kept = useMemo(() => rows.map((row) => ({ id: row.person.id, row })), [rows]);
  const [entering] = useEntering(kept.map(({ id }) => id));

  const add = async () => {
    const text = typing ?? "";
    if (!asking && !text.trim()) return setTyping(null);
    const refused = await onAdd(text);
    setProblem(refused);
    if (!asking && !refused) setTyping(null);
  };
  const choose = (row: PersonRow, press: Press) => {
    setProblem(null);
    if (mode === "remove") return onRemove(row.person.id, press);
    if (!picking) return onView(row.person.id);
    if (row.heldElsewhere) return setHeld(row.person.id);
    onPick(row.person.id, false);
  };
  const leave = (next: Mode) => {
    setMode(next);
    setHeld(null);
    setProblem(null);
    setTyping(null);
  };
  const removable = rows.length > 1;

  return (
    <View pointerEvents={chosen === null ? "auto" : "none"} style={styles.sheet}>
      {asking ? (
        <Pinned>
          {onPage ? (
            <View style={styles.back}>
              <TextLink icon="back" label={say.back} name={say.backPick} onPress={onClose} outsideScroll />
            </View>
          ) : null}
          <View style={styles.topline}>
            <Text style={[type.body, styles.invite, { color: c.muted }]}>
              <Text style={[styles.strong, { color: c.ink }]}>{intro.lead}</Text>
              {intro.rest}
              {intro.strong ? <Text style={[styles.strong, { color: c.ink }]}>{intro.strong}</Text> : null}
            </Text>
            {onPage ? null : (
              <View style={styles.close}>
                <Button kind="icon" icon="x" name={say.closePick} onPress={onClose} outsideScroll />
              </View>
            )}
          </View>
          <Text role="heading" aria-level={2} style={[type.title, styles.ask, { color: c.ink }]}>
            {say.question}
          </Text>
        </Pinned>
      ) : (
        <>
          <SheetHeader title={say.people} onClose={onClose} />
          <Text style={[type.caption, styles.hint, { color: c.muted }]}>{mode === "switch" ? (onPage ? say.switchHintClick : say.switchHint) : mode === "remove" ? (onPage ? say.removeHintClick : say.removeHint) : onPage ? say.peopleHintClick : say.peopleHint}</Text>
        </>
      )}
      <View role="list" style={styles.rows}>
        <KeptRows rows={kept} entering={entering}>
          {({ row }) =>
            row.person.id === held ? (
              <View role="listitem" style={[styles.claimback, { borderTopColor: c.hairline }]}>
                <Text style={[type.body, { color: c.ink }]}>{row.person.name}</Text>
                <Text style={[type.caption, { color: c.muted }]}>{say.pickedElsewhere}</Text>
                <View style={styles.two}>
                  <View style={styles.half}>
                    <Button label={say.thatsMe} onPress={() => onPick(row.person.id, true)} outsideScroll />
                  </View>
                  <View style={styles.half}>
                    <TextLink center label={say.cancel} onPress={() => setHeld(null)} outsideScroll />
                  </View>
                </View>
              </View>
            ) : (
              <View role="listitem">
                <Line row={row} mode={asking ? "switch" : mode} asking={asking} host={row.person.id === rows[0].person.id} chosen={chosen} onPress={(press) => choose(row, press)} />
              </View>
            )
          }
        </KeptRows>
      </View>
      {asking ? (
        typing === null ? (
          <TextLink label={`${say.notHere} ${say.addYourself}`} onPress={() => setTyping("")} outsideScroll />
        ) : (
          <View style={styles.adding}>
            <UnderlineInput
              autoFocus
              aria-label={say.yourName}
              placeholder={say.yourName}
              value={typing}
              autoCapitalize="words"
              enterKeyHint="go"
              onChange={(event) => setTyping(typedName(event))}
              onSubmitEditing={add}
              submitBehavior="submit"
              blurOnSubmit={false}
            />
            {problem ? <Text role="alert" style={[type.caption, { color: c.warn }]}>{problem}</Text> : null}
            <Button label={typing.trim() ? say.joinAs(typing.trim()) : say.yourName} disabled={!typing.trim()} onPress={add} outsideScroll />
          </View>
        )
      ) : (
        <View style={[styles.phone, { borderTopColor: c.hairline }]}>
          <Text style={[type.caption, styles.phoneIs, { color: c.muted }]}>{onPage ? say.computerIs(meName) : say.phoneIs(meName)}</Text>
          {mode === "remove" ? null : <TextLink label={mode === "switch" ? say.cancel : say.switchAccount} onPress={() => leave(mode === "switch" ? "view" : "switch")} outsideScroll />}
        </View>
      )}
      {asking || mode === "switch" ? null : (
        <View style={styles.links}>
          {typing === null ? (
            <>
              {mode === "view" ? <TextLink plus label={say.addPerson} onPress={() => setTyping("")} outsideScroll /> : null}
              {removable ? <TextLink label={mode === "remove" ? say.done : say.removeSomeone} onPress={() => leave(mode === "remove" ? "view" : "remove")} outsideScroll /> : null}
            </>
          ) : (
            <View style={[styles.adding, styles.addRow]}>
              <UnderlineInput
                autoFocus
                aria-label={say.newPerson}
                placeholder={say.newPerson}
                value={typing}
                autoCapitalize="words"
                enterKeyHint="done"
                onChange={(event) => {
                  setTyping(typedName(event));
                  setProblem(null);
                }}
                onSubmitEditing={add}
                onBlur={() => {
                  if (!typing.trim()) setTyping(null);
                }}
                submitBehavior="submit"
                blurOnSubmit={false}
              />
            </View>
          )}
        </View>
      )}
      {problem && !asking ? (
        <Text role="alert" style={[type.caption, { color: c.warn }]}>
          {problem}
        </Text>
      ) : null}
      {asking ? (
        <View style={styles.link}>
          <LinkLine url={url} />
        </View>
      ) : null}
    </View>
  );
}

type LineProps = { row: PersonRow; mode: Mode; asking: boolean; host: boolean; chosen: ParticipantId | null; onPress: (press: Press) => void };

/** One person's row: a radio while picking, a trash while removing, and their share while viewing. Link ready's switch list uses it too. */
export function Line({ row, mode, asking, host, chosen, onPress }: LineProps) {
  const c = useColors();
  const onPage = useOnPage();
  const reduce = useReducedMotion();
  const { person } = row;
  const removing = mode === "remove";
  const mine = row.mine && !asking;
  const on = chosen === person.id || (mode === "switch" ? mine : mode === "view" && row.viewed);
  // Picking is a choice among equals, so names read as ink; only a name another phone holds steps back. Elsewhere the viewed row alone is ink.
  const picking = asking || mode === "switch";
  const ink = picking ? (row.heldElsewhere && !on ? c.muted : c.ink) : on ? c.ink : c.muted;
  const name = mode === "switch" && row.heldElsewhere ? say.pickedName(person.name) : mine ? `${person.name}, ${say.you}` : person.name;
  const tags = [...(mine ? [say.you] : []), ...(host && !asking ? [say.getsPaid] : [])];
  const note = row.heldElsewhere && (mode === "switch" || !host) ? say.pickedElsewhere.replace(/\.$/, "") : asking ? null : mine ? (onPage ? say.thisComputer : say.thisPhone) : null;
  return (
    <PressTarget
      name={removing ? say.removePerson(person.name) : name}
      toggled={removing ? undefined : on}
      disabled={removing && host}
      outsideScroll
      onPress={onPress}
      style={(pressed) => pressStyle(pressed, reduce)}
    >
      {() => (
        <View style={[styles.row, { borderTopColor: c.hairline }]}>
          <View style={styles.lead}>
            {removing ? (
              <View style={styles.mark}>{host ? null : <Icon name="trash" size={16} color={c.muted} />}</View>
            ) : (
              <View style={[styles.mark, styles.radio, dotFade, on ? { backgroundColor: c.ink, boxShadow: `inset 0 0 0 1.5px ${c.ink}` } : { boxShadow: `inset 0 0 0 1.5px ${c.dash}` }]} />
            )}
            <View style={styles.text}>
              <View style={styles.title}>
                <Text numberOfLines={1} style={[type.body, colorFade, styles.name, { color: ink }]}>
                  {person.name}
                </Text>
                {tags.length > 0 ? <Text style={[type.caption, styles.tag, { color: c.muted }]}>{say.tags(tags)}</Text> : null}
              </View>
              {note ? <Text numberOfLines={1} style={[type.caption, { color: c.muted }]}>{note}</Text> : null}
            </View>
          </View>
          {asking || mode === "switch" ? null : <Text style={[type.body, tabular, colorFade, { color: ink }]}>{row.share}</Text>}
        </View>
      )}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: layout.blockGap },
  topline: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  invite: { flex: 1, marginTop: 2 },
  strong: { fontWeight: "500" },
  close: { marginTop: -10, marginRight: -12 },
  // The link's 44 px target overhangs its text, so the arrow lines up with the invite's left edge and the gap below matches the X's row.
  back: { marginTop: -12, marginBottom: -4 },
  ask: { marginBottom: 4 },
  hint: { marginTop: -6 },
  rows: {},
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, minHeight: 44, paddingVertical: 10, borderTopWidth: 1 },
  lead: { flexDirection: "row", alignItems: "flex-start", gap: 12, flexShrink: 1, minWidth: 0 },
  text: { flexShrink: 1, minWidth: 0 },
  mark: { width: 16, height: 16, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 4 },
  title: { flexDirection: "row", alignItems: "baseline", minWidth: 0 },
  name: { flexShrink: 1 },
  tag: { flexShrink: 0 },
  radio: { width: 16, height: 16, borderRadius: 8 },
  claimback: { gap: 6, paddingVertical: 12, borderTopWidth: 1 },
  two: { flexDirection: "row", gap: layout.pairGap, marginTop: 6 },
  half: { flex: 1 },
  adding: { gap: 10, flex: 1 },
  addRow: { minHeight: 44, justifyContent: "center" },
  link: { marginTop: 12 },
  phone: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: 1, paddingTop: 2 },
  phoneIs: { flexShrink: 1 },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: 20, marginTop: -6 },
});
