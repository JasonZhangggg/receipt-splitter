import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import type { ParticipantId, Split } from "../../core/split";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { useReducedMotion, webAnimation, webStyle } from "../motion";
import type { Answer } from "../../live/client";
import { failedCopy, splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";
import { historyOf, whenText, type Entry } from "./describe";
import { SheetHeader } from "../split-view/sheet-header";

type Props = {
  split: Split;
  me: ParticipantId | null;
  onRevert: (revision: number) => Promise<Answer>;
  onRestore: () => Promise<Answer>;
  onClose: () => void;
};

type Target = number | "restore";

/** How long the undo arrow's swing runs (icon-css.ts), which the link stays on screen to finish after a tap. */
const swingFor = 560;

export function HistorySheet({ split, me, onRevert, onRestore, onClose }: Props) {
  const c = useColors();
  const [now, setNow] = useState(() => Date.now());
  const [asking, setAsking] = useState<Target | null>(null);
  const [pending, setPending] = useState<Target | null>(null);
  const [failed, setFailed] = useState<{ readonly target: Target; readonly words: string } | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const entries = historyOf(split);
  const [host] = split.participants;
  // Another phone may have reverted the same change first. Then the Revert is already done, so there is nothing to confirm and nothing to complain about.
  const stale = (target: Target) => target !== "restore" && (entries.find(({ revision }) => revision === target)?.reverted ?? true);

  const run = async (target: Target, action: () => Promise<Answer>) => {
    setPending(target);
    const answer = await action();
    setPending(null);
    setAsking(null);
    setFailed(answer.ok ? null : { target, words: failedCopy(answer, say.revertFailed) });
  };
  const revert = (entry: Entry) => {
    if (entry.sentAs !== null && entry.sentAs === me) {
      void run(entry.revision, () => onRevert(entry.revision));
      return true;
    }
    setAsking(entry.revision);
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
            meta={[entry.name ? say.asName(entry.name) : say.someone, whenText(entry.at, now)]}
            reverted={entry.reverted}
            what={
              <Text style={[type.body, styles.what, { color: c.ink }]}>
                {entry.lead}
                {entry.before !== undefined ? <Text style={[styles.muted, { color: c.muted }]}>{`${entry.lead ? " " : ""}${entry.before} → `}</Text> : null}
                {entry.after ?? ""}
                {entry.more > 0 ? <Text style={[styles.muted, { color: c.muted }]}>{` ${say.andMore(entry.more)}`}</Text> : null}
              </Text>
            }
            confirm={(swing) =>
              asking === entry.revision && pending !== entry.revision && !entry.reverted ? (
                <Confirm
                  question={say.confirmRevert(entry.name ?? say.someone)}
                  action={say.confirm}
                  onYes={() => {
                    swing();
                    void run(entry.revision, () => onRevert(entry.revision));
                  }}
                  onNo={() => setAsking(null)}
                />
              ) : null
            }
            asking={asking === entry.revision}
            busy={pending === entry.revision}
            canAct={entry.revertible}
            label={say.revert}
            name={`${say.revert} ${entry.lead || entry.after}`}
            onAct={() => revert(entry)}
          />
        ))}
        <Row
          meta={[say.asName(host.name)]}
          reverted={false}
          what={<Text style={[type.body, styles.what, { color: c.ink }]}>{say.created}</Text>}
          confirm={(swing) =>
            asking === "restore" && pending !== "restore" ? (
              <Confirm
                question={say.confirmRestore}
                action={say.confirmRestoreAction}
                onYes={() => {
                  swing();
                  void run("restore", onRestore);
                }}
                onNo={() => setAsking(null)}
              />
            ) : null
          }
          asking={asking === "restore"}
          busy={pending === "restore"}
          canAct={split.original !== undefined}
          label={say.restore}
          name={say.restoreName}
          onAct={() => {
            setAsking("restore");
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
  /** Given the arrow's swing, which an accepted confirm plays. */
  confirm: (swing: () => void) => ReactNode;
  asking: boolean;
  /** The action is on its way to the Split. */
  busy: boolean;
  canAct: boolean;
  label: string;
  name: string;
  /** Returns whether the action applied at once, so the arrow swings now and not on a later confirm. */
  onAct: () => boolean;
};

function Row({ meta, reverted, what, confirm, asking, busy, canAct, label, name, onAct }: RowProps) {
  const c = useColors();
  const reduce = useReducedMotion();
  // A Revert applies the moment it is accepted. Only its link stays a beat, so the undo arrow finishes its swing before "Reverted" takes the place.
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
  const act = () => {
    if (!locked && onAct()) swing();
  };
  const link = canAct && (swinging || (!asking && !reverted));
  return (
    <View role="listitem" style={[styles.row, { borderTopColor: c.hairline }]}>
      <View style={styles.body}>
        <View style={[reverted && styles.dimmed, !reduce && dim]}>{what}</View>
        <Text style={[type.caption, { color: c.muted }]}>{meta.filter(Boolean).join(" · ")}</Text>
        {swinging ? null : confirm(swing)}
      </View>
      {link ? <Act label={label} name={name} locked={locked} onPress={act} /> : null}
      {reverted && !swinging ? <Reverted fresh={settled} /> : null}
    </View>
  );
}

// React Native has no text-underline-offset, so the browser's own is set through the style object.
const underline = { textDecorationLine: "underline", textDecorationThickness: "1px", textUnderlineOffset: "3px" } as TextStyle;

/** An underlined link with the undo arrow before it. The arrow swings on a press, or on a hover with a mouse. */
function Act({ label, name, locked, onPress }: { label: string; name: string; locked: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <PressTarget name={name} outsideScroll disabled={locked} onPress={onPress} style={() => styles.act}>
      {(pressed) => {
        const ink = pressed ? c.ink : c.muted;
        return (
          <View style={styles.actFace}>
            <Icon name="history" size={14} color={ink} />
            <Text style={[type.caption, underline, { color: ink, textDecorationColor: ink }]}>{label}</Text>
          </View>
        );
      }}
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

function Confirm({ question, action, onYes, onNo }: { question: string; action: string; onYes: () => void; onNo: () => void }) {
  const c = useColors();
  return (
    <View role="alertdialog" aria-label={question} style={styles.confirm}>
      <Text style={[type.body, { color: c.ink }]}>{question}</Text>
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
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, minHeight: 64, paddingVertical: 10, borderTopWidth: 1 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  what: { fontVariant: ["tabular-nums"] },
  muted: { fontWeight: "400" },
  dimmed: { opacity: 0.45 },
  act: { minHeight: 44, justifyContent: "center", marginVertical: -8 },
  actFace: { flexDirection: "row", alignItems: "center", gap: 5 },
  done: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 28 },
  confirm: { gap: 10, marginTop: 8 },
  two: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
});
