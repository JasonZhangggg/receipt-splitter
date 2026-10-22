import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ParticipantId, Split } from "../../core/split";
import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { useReducedMotion, webAnimation, webStyle } from "../motion";
import type { Answer } from "../../live/client";
import { failedCopy, splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import { historyOf, restoreChanges, whenText, type Entry } from "./describe";
import { SheetHeader } from "../split-view/sheet-header";

export type HistoryTarget = number | "restore";

/** A Revert of someone else's change, or a Restore, asked in a popover hung from the row's arrow, as a claim for someone else is. */
export type HistoryAsk = { readonly target: HistoryTarget; readonly question: string; readonly action: string; readonly from: Press; readonly onYes: () => void };

type Props = {
  split: Split;
  me: ParticipantId | null;
  onRevert: (revision: number) => Promise<Answer>;
  onRestore: () => Promise<Answer>;
  onAsk: (ask: HistoryAsk) => void;
  onClose: () => void;
};

/** How long the undo arrow's swing runs (icon-css.ts), which the link stays on screen to finish after a tap. */
const swingFor = 560;

export function HistorySheet({ split, me, onRevert, onRestore, onAsk, onClose }: Props) {
  const c = useColors();
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<HistoryTarget | null>(null);
  const [failed, setFailed] = useState<{ readonly target: HistoryTarget; readonly words: string } | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const entries = historyOf(split);
  const restorable = useMemo(() => restoreChanges(split), [split]);
  const [host] = split.participants;
  // Another phone may have reverted the same change first. Then the Revert is already done, so there is nothing to complain about.
  const stale = (target: HistoryTarget) => target !== "restore" && (entries.find(({ revision }) => revision === target)?.reverted ?? true);

  const run = async (target: HistoryTarget, action: () => Promise<Answer>) => {
    setPending(target);
    const answer = await action();
    setPending(null);
    setFailed(answer.ok ? null : { target, words: failedCopy(answer, say.revertFailed) });
  };
  const revert = (entry: Entry, from: Press, swing: () => void) => {
    if (entry.sentAs !== null && entry.sentAs === me) {
      void run(entry.revision, () => onRevert(entry.revision));
      return true;
    }
    onAsk({
      target: entry.revision,
      question: say.confirmRevert(entry.name ?? say.someone),
      action: say.confirm,
      from,
      onYes: () => {
        swing();
        void run(entry.revision, () => onRevert(entry.revision));
      },
    });
    return false;
  };

  return (
    <View style={styles.sheet}>
      <SheetHeader title={say.history} onClose={onClose} />
      {failed !== null && !stale(failed.target) ? <Text style={[type.caption, styles.problem, { color: c.muted }]}>{failed.words}</Text> : null}
      <Text style={[type.body, { color: c.muted }]}>{say.historyKept}</Text>
      <View role="list" aria-label={say.history}>
        {entries.map((entry) => (
          <Row
            key={entry.revision}
            meta={[entry.byline ? (entry.name ?? say.someone) : null, whenText(entry.at, now)]}
            reverted={entry.reverted}
            what={
              <Text style={[type.body, styles.what, { color: c.ink }]}>
                {entry.lead}
                {entry.before !== undefined ? <Text style={[styles.muted, { color: c.muted }]}>{`${entry.lead ? " " : ""}${entry.before} → `}</Text> : null}
                {entry.after ?? ""}
                {entry.more > 0 ? <Text style={[styles.muted, { color: c.muted }]}>{` ${say.andMore(entry.more)}`}</Text> : null}
              </Text>
            }
            busy={pending === entry.revision}
            canAct={entry.revertible}
            name={`${say.revert} ${entry.lead || entry.after}`}
            onAct={(from, swing) => revert(entry, from, swing)}
          />
        ))}
        <Row
          meta={[host.name]}
          reverted={false}
          what={<Text style={[type.body, styles.what, { color: c.ink }]}>{say.created}</Text>}
          busy={pending === "restore"}
          canAct={restorable}
          name={say.restoreName}
          onAct={(from, swing) => {
            onAsk({
              target: "restore",
              question: say.confirmRestore,
              action: say.confirmRestoreAction,
              from,
              onYes: () => {
                swing();
                void run("restore", onRestore);
              },
            });
            return false;
          }}
        />
      </View>
    </View>
  );
}

type RowProps = {
  meta: readonly (string | null)[];
  reverted: boolean;
  what: ReactNode;
  /** The action is on its way to the Split. */
  busy: boolean;
  canAct: boolean;
  name: string;
  /** Given the press and the arrow's swing, which an accepted confirm plays. Returns whether the action applied at once, so the arrow swings now and not on a later confirm. */
  onAct: (from: Press, swing: () => void) => boolean;
};

function Row({ meta, reverted, what, busy, canAct, name, onAct }: RowProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  // A Revert applies the moment it is accepted. Only its arrow stays a beat, so it finishes its swing before "Reverted" takes the place.
  const [swinging, setSwinging] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!swinging) return;
    const timer = setTimeout(() => {
      setSwinging(false);
      setSettled(true);
    }, swingFor);
    return () => clearTimeout(timer);
  }, [swinging]);
  const swing = () => {
    if (!reduce) setSwinging(true);
  };
  const locked = busy || swinging;
  const act = (from: Press) => {
    if (!locked && onAct(from, swing)) swing();
  };
  const link = canAct && (swinging || !reverted);
  return (
    <View role="listitem" style={[styles.row, { borderTopColor: c.hairline }]}>
      <View style={styles.body}>
        <View style={[reverted && styles.dimmed, !reduce && dim]}>{what}</View>
        <Text style={[type.caption, { color: c.muted }]}>{meta.filter(Boolean).join(" · ")}</Text>
      </View>
      {link ? <Act name={name} locked={locked} onPress={act} /> : null}
      {reverted && !swinging ? <Reverted fresh={settled} /> : null}
    </View>
  );
}

/** The undo arrow alone, so a long list does not repeat the same word down its edge. It swings on a press, or on a hover with a mouse. */
function Act({ name, locked, onPress }: { name: string; locked: boolean; onPress: (from: Press) => void }) {
  const c = useColors();
  return (
    <PressTarget name={name} outsideScroll disabled={locked} onPress={onPress} style={() => styles.act}>
      {(pressed) => <Icon name="history" size={18} color={pressed ? c.ink : c.muted} />}
    </PressTarget>
  );
}

/** The gray tick and "Reverted" a row settles to. It slides in only when this phone has just watched the arrow finish. */
function Reverted({ fresh }: { fresh: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={[styles.done, fresh && (reduce ? doneFade : doneIn)]}>
      <Icon name="check" size={13} color={c.muted} />
      <Text style={[type.caption, { color: c.muted }]}>{say.reverted}</Text>
    </View>
  );
}

const dim = webStyle({ transitionProperty: "opacity", transitionDuration: "150ms", transitionTimingFunction: "ease-out" });
const doneIn = webAnimation({
  animationKeyframes: [{ from: { opacity: 0, transform: "translateX(4px)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: "260ms",
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});
const doneFade = webAnimation({
  animationKeyframes: [{ from: { opacity: 0 }, to: { opacity: 1 } }],
  animationDuration: "150ms",
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});

const styles = StyleSheet.create({
  sheet: { gap: layout.blockGap },
  problem: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 64, paddingVertical: 10, borderTopWidth: 1 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  what: { fontVariant: ["tabular-nums"] },
  muted: { fontWeight: "400" },
  dimmed: { opacity: 0.45 },
  // 44 px to hit, with the glyph on the column's right edge, centered on the row however many lines it wraps to.
  act: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center", marginVertical: -10 },
  done: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 28 },
});
