import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ParticipantId, Split } from "../../core/split";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";
import { Dot } from "../split-view/dot";
import { historyOf, whenText, type Entry } from "./describe";

type Props = {
  split: Split;
  me: ParticipantId | null;
  onRevert: (revision: number) => Promise<boolean>;
  onRestore: () => Promise<boolean>;
  onClose: () => void;
};

type Asking = { readonly revision: number | "restore"; readonly name: string | null };

/** History of frame I3: Payments and manual Receipt changes, newest first, each revertable once. Reverting a change made on another device, or restoring the Receipt, asks first. */
export function HistorySheet({ split, me, onRevert, onRestore, onClose }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState<Asking | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const entries = historyOf(split);
  const [host] = split.participants;

  const run = async (action: () => Promise<boolean>) => {
    setAsking(null);
    setProblem((await action()) ? null : say.revertFailed);
  };
  const revert = (entry: Entry) => {
    if (entry.by !== null && entry.by === me) return void run(() => onRevert(entry.revision));
    setAsking({ revision: entry.revision, name: entry.name });
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.topline}>
        <Text role="heading" aria-level={2} style={[type.title, styles.title, { color: c.ink }]}>
          {say.history}
        </Text>
        <PressTarget name={say.close} outsideScroll onPress={onClose} style={(pressed) => [styles.closeHit, pressStyle(pressed, reduce)]}>
          {() => (
            <View style={[styles.close, { backgroundColor: c.sheetIn }]}>
              <Icon name="x" size={16} color={c.ink} />
            </View>
          )}
        </PressTarget>
      </View>
      {problem ? <Text style={[type.small, styles.problem, { backgroundColor: c.flagWash, color: c.flag }]}>{problem}</Text> : null}
      <View role="list" aria-label={say.history}>
        {entries.map((entry) => (
          <Row
            key={entry.revision}
            name={entry.name ?? say.someone}
            meta={[entry.name ? say.asName(entry.name) : say.someone, whenText(entry.at, now)]}
            reverted={entry.reverted}
            what={
              <Text style={[type.button, styles.what, { color: c.ink }]}>
                {entry.lead}
                {entry.before !== undefined ? <Text style={[styles.muted, { color: c.muted }]}>{`${entry.lead ? " " : ""}${entry.before} → `}</Text> : null}
                {entry.after ?? ""}
                {entry.more > 0 ? <Text style={[styles.muted, { color: c.muted }]}>{` ${say.andMore(entry.more)}`}</Text> : null}
              </Text>
            }
            confirm={
              asking?.revision === entry.revision ? (
                <Confirm question={say.confirmRevert(asking.name ?? say.someone)} action={say.confirm} onYes={() => run(() => onRevert(entry.revision))} onNo={() => setAsking(null)} />
              ) : null
            }
            end={entry.reverted || asking?.revision === entry.revision ? null : <End label={say.revert} name={`${say.revert} ${entry.lead || entry.after}`} onPress={() => revert(entry)} />}
          />
        ))}
        <Row
          name={host.name}
          meta={[say.asName(host.name)]}
          reverted={false}
          what={<Text style={[type.button, styles.what, { color: c.ink }]}>{say.created}</Text>}
          confirm={asking?.revision === "restore" ? <Confirm question={say.confirmRestore} action={say.confirmRestoreAction} onYes={() => run(onRestore)} onNo={() => setAsking(null)} /> : null}
          end={split.original && asking?.revision !== "restore" ? <End label={say.restore} name={say.restoreName} onPress={() => setAsking({ revision: "restore", name: null })} /> : null}
        />
      </View>
    </View>
  );
}

type RowProps = { name: string; meta: readonly (string | null)[]; reverted: boolean; what: ReactNode; confirm: ReactNode; end: ReactNode };

function Row({ name, meta, reverted, what, confirm, end }: RowProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View role="listitem" style={[styles.row, { borderBottomColor: c.hairline }]}>
      <View style={[styles.lead, reverted && styles.dimmed, !reduce && dim]}>
        <Dot name={name} size={32} />
      </View>
      <View style={styles.body}>
        <View style={[reverted && styles.dimmed, !reduce && dim]}>{what}</View>
        <Text style={[type.caption, { color: c.muted }]}>{meta.filter(Boolean).join(" · ")}</Text>
        {confirm}
      </View>
      {reverted ? <Text style={[type.caption, styles.tag, { color: c.muted }]}>{say.reverted}</Text> : null}
      {end}
    </View>
  );
}

function End({ label, name, onPress }: { label: string; name: string; onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <PressTarget name={name} outsideScroll onPress={onPress} style={(pressed) => pressStyle(pressed, reduce)}>
      {() => (
        <View style={[styles.end, { backgroundColor: c.sheetIn }]}>
          <Text style={[type.label, { color: c.ink }]}>{label}</Text>
        </View>
      )}
    </PressTarget>
  );
}

function Confirm({ question, action, onYes, onNo }: { question: string; action: string; onYes: () => void; onNo: () => void }) {
  const c = useColors();
  return (
    <View role="alertdialog" aria-label={question} style={styles.confirm}>
      <Text style={[type.secondary, { color: c.ink }]}>{question}</Text>
      <View style={styles.two}>
        <View style={styles.half}>
          <Button label={action} onPress={onYes} outsideScroll />
        </View>
        <View style={styles.half}>
          <Button kind="soft" label={say.cancel} onPress={onNo} outsideScroll />
        </View>
      </View>
    </View>
  );
}

const dim = webStyle({ transitionProperty: "opacity", transitionDuration: "150ms", transitionTimingFunction: "ease-out" });

const styles = StyleSheet.create({
  sheet: { gap: layout.blockGap },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, lineHeight: 22, marginTop: 2 },
  closeHit: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  problem: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 8, borderBottomWidth: 1 },
  lead: { alignSelf: "flex-start", paddingTop: 4 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  what: { fontVariant: ["tabular-nums"] },
  muted: { fontWeight: "400" },
  dimmed: { opacity: 0.45 },
  tag: { paddingRight: 6 },
  end: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center" },
  confirm: { gap: 10, marginTop: 8 },
  two: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
});
