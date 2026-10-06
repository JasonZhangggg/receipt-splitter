import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import type { Cents } from "../../core/money";
import { handleText } from "../../core/operations";
import { payLink } from "../../core/pay-links";
import type { PaymentHandle, PaymentService, SplitId } from "../../core/split";
import { rememberSplit, splitOnDevice } from "../../device";
import { money } from "../../draft";
import { Button, PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { paymentApps } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import { capsuleInset } from "./capsule";
import { MethodPicker } from "./method-picker";
import type { PayState } from "./model";

type Props = { split: SplitId; host: string; handles: readonly PaymentHandle[]; state: PayState; onPaid: (paid: boolean) => void };

/** Venmo notes can be public, so the note stays generic. */
const note = "Receipt split";
const target = Platform.OS === "web" ? "web" : "app";

export function PayBlock({ split, host, handles, state, onPaid }: Props) {
  if (state.kind === "nothing") return null;
  const due = state.kind === "unpaid" ? state.owe : state.kind === "short" ? state.rest : null;
  return (
    <View style={styles.box}>
      {due === null || handles.length === 0 ? null : <PayWays split={split} host={host} handles={handles} amount={due} />}
      <View style={styles.center}>
        <Button
          kind="link"
          label={state.kind === "unpaid" ? say.alreadyPaid : state.kind === "short" ? say.paidRest : say.undoPaid}
          onPress={() => onPaid(state.kind === "unpaid" || state.kind === "short")}
          outsideScroll
        />
      </View>
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
                {href === null ? <Icon name={done ? "check" : "copy"} size={18} color={c.onAction} /> : null}
                {done ? (
                  <Text style={[type.button, { color: c.onAction }]}>{say.copied}</Text>
                ) : (
                  <>
                    <Text style={[type.button, styles.head, { color: c.onAction }]}>{say.payHead}</Text>
                    <Text numberOfLines={1} style={[type.button, styles.name, { color: c.onAction }]}>{host}</Text>
                    <Text style={[type.button, styles.head, { color: c.onAction }]}>{say.payTail(due, choices.length > 1 ? null : app.name)}</Text>
                  </>
                )}
              </View>
              {choices.length > 1 ? <AppName service={handle.service} tint={c.onAction} /> : null}
            </View>
          )}
        </PressTarget>
        {choices.length > 1 ? (
          <MethodPicker service={handle.service} choices={choices} onPick={pick} name={say.payWith}>
            <AppName service={handle.service} tint={c.onAction} />
          </MethodPicker>
        ) : null}
      </View>
      {/* A long line breaks after a dot, never before one or between an app and its handle. */}
      <Text style={[type.caption, styles.handles, { color: c.muted }]}>{handles.map((each) => `${paymentApps[each.service].name}\u00a0${handleText(each)}`).join("\u00a0· ")}</Text>
      {problem ? <Text style={[type.small, styles.handles, { color: c.muted }]}>{say.copyValueFailed}</Text> : null}
    </View>
  );
}

/** The app's name on the pill, on a lighter capsule with a chevron, so it reads as the part that switches the app. */
function AppName({ service, tint }: { service: PaymentService; tint: string }) {
  return (
    <View style={styles.app}>
      <View style={[StyleSheet.absoluteFill, styles.capsule, { backgroundColor: tint }]} />
      <Text style={[type.button, { color: tint }]}>{paymentApps[service].name}</Text>
      <Icon name="chevron" size={16} color={tint} />
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

/** A name past about 13 characters ends in an ellipsis, so "Pay name" stays on one line and the amount and app wrap together onto the next. */
const nameMax = 112;

const styles = StyleSheet.create({
  box: { gap: 4 },
  ways: { gap: 10 },
  pill: { flexDirection: "row", alignItems: "center", minHeight: 54, borderRadius: 27, paddingVertical: 7, paddingHorizontal: 24 },
  picking: { paddingLeft: 20, paddingRight: capsuleInset },
  say: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 8 },
  head: { flexShrink: 0 },
  name: { flexShrink: 1, maxWidth: nameMax },
  app: { flexDirection: "row", alignItems: "center", gap: 4, height: 40, paddingLeft: 14, paddingRight: 10, borderRadius: 20 },
  capsule: { borderRadius: 20, opacity: 0.16 },
  handles: { textAlign: "center", marginHorizontal: 4 },
  center: { alignItems: "center" },
});
