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

type Props = { split: SplitId; host: string; handles: readonly PaymentHandle[]; state: PayState; onPaid: (paid: boolean) => void };

/** Venmo notes can be public, so the note stays generic. */
const note = "Receipt split";
const target = Platform.OS === "web" ? "web" : "app";

export function PayBlock({ split, host, handles, state, onPaid }: Props) {
  const c = useColors();
  if (state.kind === "nothing") return null;
  const due = state.kind === "unpaid" ? state.owe : state.kind === "short" ? state.rest : null;
  const paid = state.kind === "settled" || state.kind === "over" ? state.paid : null;
  return (
    <View style={styles.box}>
      {due === null || handles.length === 0 ? null : <PayWays split={split} host={host} handles={handles} amount={due} />}
      {paid === null ? null : (
        <View style={[styles.paid, { borderColor: c.hairline }]}>
          <Icon name="check" size={16} color={c.good} />
          <Text style={[type.body, tabular, { color: c.good }]}>{say.youPaid(money(paid))}</Text>
        </View>
      )}
      <TextLink center label={state.kind === "unpaid" ? say.alreadyPaid : state.kind === "short" ? say.paidRest : say.markNotPaid} onPress={() => onPaid(state.kind === "unpaid" || state.kind === "short")} outsideScroll />
    </View>
  );
}

function PayWays({ split, host, handles, amount }: { split: SplitId; host: string; handles: readonly PaymentHandle[]; amount: Cents }) {
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
    <View style={styles.ways}>
      <View>
        <PressTarget
          {...action}
          name={href !== null ? say.payOn(host, due, app.name) : done ? say.copied : say.copyToPayOnZelle(handle.handle, host, due)}
          outsideScroll
          style={(pressed) => pressStyle(pressed, reduce)}
        >
          {() => (
            <View style={[styles.pill, choices.length > 1 && styles.picking, { backgroundColor: c.action }]}>
              <View style={styles.say}>
                {href === null ? <View style={styles.icon}><Icon name={done ? "check" : "copy"} size={18} color={c.onAction} /></View> : null}
                {done ? null : <Mark glyph={app.glyph} ink={c.onAction} fill={c.action} />}
                <Text numberOfLines={1} style={[type.body, { color: c.onAction }]}>{done ? say.copied : app.name}</Text>
              </View>
              {choices.length > 1 ? <Switcher tint={c.onAction} /> : null}
            </View>
          )}
        </PressTarget>
        {choices.length > 1 ? (
          <MethodPicker service={handle.service} choices={choices} onPick={pick} name={say.payWith}>
            <Switcher tint={c.onAction} />
          </MethodPicker>
        ) : null}
      </View>
      {/* One app and handle per line, joined by a no-break space, so a line never ends on a separator or splits a handle. */}
      <View style={styles.handleList}>
        {handles.map((each) => (
          <Text key={each.service} style={[type.caption, styles.handles, { color: c.muted }]}>{`${paymentApps[each.service].name}\u00a0${handleText(each)}`}</Text>
        ))}
      </View>
      {problem ? <Text style={[type.caption, styles.handles, { color: c.muted }]}>{say.copyValueFailed}</Text> : null}
    </View>
  );
}

/** The chevron end of the pill, set off by a hairline so it reads as the part that switches the app. */
function Switcher({ tint }: { tint: string }) {
  return (
    <View style={styles.switcher}>
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
  handleList: { gap: 2 },
  handles: { textAlign: "center", marginHorizontal: 4 },
  paid: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 52, borderRadius: 26, borderWidth: 1 },
});
