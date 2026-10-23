import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import type { Cents } from "../../core/money";
import { handleText } from "../../core/operations";
import { payLink } from "../../core/pay-links";
import type { PaymentHandle, PaymentService, SplitId } from "../../core/split";
import { rememberSplit, splitOnDevice } from "../../device";
import { money } from "../../draft";
import { Mark, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { paymentApps } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { tabular, type, useColors } from "../theme";
import { TextLink } from "../components/text-link";
import { switcherWidth } from "./switcher";
import { MethodPicker } from "./method-picker";
import type { PayState } from "./model";

type Props = {
  split: SplitId;
  host: string;
  handles: readonly PaymentHandle[];
  state: PayState;
  busy?: boolean;
  notice?: string | null;
  onPaid: (paid: boolean) => void;
  /** The wide layout's column, where `PayButton` sits beside the amount: this block keeps only the note, the paid line and the link, flush left. */
  compact?: boolean;
};

/** Venmo notes can be public, so the note stays generic. */
const note = "Receipt split";
const target = Platform.OS === "web" ? "web" : "app";

export function PayBlock({ split, host, handles, state, busy = false, notice = null, onPaid, compact = false }: Props) {
  const c = useColors();
  if (state.kind === "nothing") return null;
  const due = state.kind === "unpaid" ? state.owe : state.kind === "short" ? state.rest : null;
  const paid = state.kind === "settled" || state.kind === "over" ? state.paid : null;
  return (
    <View style={styles.box}>
      {/* First, so a bar over the sheet's foot does not hide it. */}
      {notice === null ? null : (
        <Text role="status" style={[type.caption, compact ? null : styles.handles, { color: c.warn }]}>
          {notice}
        </Text>
      )}
      {compact || due === null || handles.length === 0 ? null : <PayWays split={split} host={host} handles={handles} amount={due} />}
      {paid === null ? null : (
        <View style={[styles.paid, compact ? styles.paidLine : { borderColor: c.hairline }]}>
          <Icon name="check" size={16} color={c.good} />
          <Text style={[type.body, tabular, { color: c.good }]}>{say.youPaid(money(paid))}</Text>
        </View>
      )}
      {compact && state.kind === "unpaid" && handles.length > 0 ? (
        <View style={styles.ask}>
          <Text style={[type.caption, { color: c.muted }]}>{say.paidAnotherWay}</Text>
          <TextLink label={say.markAsPaid} busy={busy} onPress={() => onPaid(true)} outsideScroll />
        </View>
      ) : (
        <TextLink center={!compact} label={state.kind === "unpaid" ? say.alreadyPaid : state.kind === "short" ? say.paidRest : say.markNotPaid} busy={busy} onPress={() => onPaid(state.kind === "unpaid" || state.kind === "short")} outsideScroll />
      )}
    </View>
  );
}

/** The pay pill alone, at the size of the page's other buttons, for the wide layout's column where it sits beside the amount. */
export function PayButton({ split, host, handles, amount }: { split: SplitId; host: string; handles: readonly PaymentHandle[]; amount: Cents }) {
  return handles.length === 0 ? null : <PayWays split={split} host={host} handles={handles} amount={amount} compact />;
}

function PayWays({ split, host, handles, amount, compact = false }: { split: SplitId; host: string; handles: readonly PaymentHandle[]; amount: Cents; compact?: boolean }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [problem, setProblem] = useState(false);
  const [picked, setPicked] = useState(() => splitOnDevice(split).payWith);
  const handle = handles.find(({ service }) => service === picked) ?? handles[0];
  const [copied, copy] = useCopy(handle.handle, () => setProblem(true));
  const app = paymentApps[handle.service];
  const due = money(amount);
  const href = payLink(handle, amount, note, target);
  const action = href === null ? { onPress: copy } : { href, fallbackHref: payLink(handle, amount, note, "web") ?? href };
  const done = href === null && copied;
  const choices = handles.map(({ service }) => service);
  const pick = (service: PaymentService) => {
    setPicked(service);
    setProblem(false);
    rememberSplit(split, { payWith: service });
  };
  return (
    <View style={[styles.ways, compact && styles.compactWays]}>
      <View>
        <PressTarget
          {...action}
          name={href !== null ? say.payOn(host, due, app.name) : done ? say.copied : say.copyToPayOnZelle(handle.handle, host, due)}
          outsideScroll
          style={(pressed) => pressStyle(pressed, reduce)}
        >
          {() => (
            <View style={[styles.pill, compact && styles.compactPill, choices.length > 1 && styles.picking, { backgroundColor: c.action }]}>
              <View style={styles.say}>
                {href === null ? <View style={styles.icon}><Icon name={done ? "check" : "copy"} size={18} color={c.onAction} /></View> : null}
                {done ? null : <Mark glyph={app.glyph} ink={c.onAction} fill={c.action} />}
                <Text numberOfLines={1} style={[type.body, { color: c.onAction }]}>{done ? say.copied : app.name}</Text>
              </View>
              {choices.length > 1 ? <Switcher tint={c.onAction} compact={compact} /> : null}
            </View>
          )}
        </PressTarget>
        {choices.length > 1 ? (
          <MethodPicker service={handle.service} choices={choices} onPick={pick} name={say.payWith}>
            <Switcher tint={c.onAction} compact={compact} />
          </MethodPicker>
        ) : null}
      </View>
      {/* The app and its handle joined by a no-break space, so the line never splits a handle. Only the chosen app's: the picker holds the others. */}
      <Text style={[type.caption, compact ? styles.handlesEnd : styles.handles, { color: c.muted }]}>{`${app.name}\u00a0${handleText(handle)}`}</Text>
      {problem ? <Text style={[type.caption, compact ? styles.handlesEnd : styles.handles, { color: c.muted }]}>{say.copyValueFailed}</Text> : null}
    </View>
  );
}

/** The chevron end of the pill, set off by a hairline so it reads as the part that switches the app. */
function Switcher({ tint, compact = false }: { tint: string; compact?: boolean }) {
  return (
    <View style={[styles.switcher, compact && styles.compactSwitcher]}>
      <View style={[styles.hairline, { backgroundColor: tint }]} />
      <Icon name="chevron" size={18} color={tint} />
    </View>
  );
}

/** Copies `value` and reports true until the check has shown long enough. A new value starts uncopied. */
function useCopy(value: string, onFail: () => void): [copied: boolean, copy: () => void] {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), copiedFor);
    return () => clearTimeout(timer);
  }, [copied]);
  return [copied === value, () => void navigator.clipboard.writeText(value).then(() => setCopied(value), onFail)];
}

const copiedFor = 1600;

const styles = StyleSheet.create({
  box: { gap: 4 },
  ways: { gap: 10 },
  pill: { flexDirection: "row", alignItems: "center", height: 54, borderRadius: 27, paddingHorizontal: 24 },
  picking: { paddingRight: 0 },
  say: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 4 },
  icon: { marginRight: 8 },
  switcher: { width: switcherWidth, height: 54, alignItems: "center", justifyContent: "center" },
  hairline: { position: "absolute", left: 0, width: 1, height: 24, opacity: 0.3 },
  handles: { textAlign: "center", marginHorizontal: 4 },
  paid: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 52, borderRadius: 26, borderWidth: 1 },
  paidLine: { justifyContent: "flex-start", height: 32, borderWidth: 0 },
  ask: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 6 },
  compactWays: { gap: 6, alignItems: "flex-end" },
  // The height of the page's other secondary buttons.
  compactPill: { height: 44, paddingHorizontal: 20 },
  compactSwitcher: { height: 44 },
  handlesEnd: { textAlign: "right" },
});
