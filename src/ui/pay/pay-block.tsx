import { Platform, StyleSheet, Text, View } from "react-native";

import type { Cents } from "../../core/money";
import { handleText } from "../../core/operations";
import { payLink } from "../../core/pay-links";
import type { PaymentHandle } from "../../core/split";
import { money } from "../../draft";
import { Button } from "../components/button";
import { paymentApps } from "../home-copy";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";
import type { PayState } from "./model";
import { ZelleCard } from "./zelle-card";

type Props = { host: string; handles: readonly PaymentHandle[]; state: PayState; onPaid: (paid: boolean) => void };

/** Venmo notes can be public, so the note stays generic. */
const note = "Receipt split";
const target = Platform.OS === "web" ? "web" : "app";

export function PayBlock({ host, handles, state, onPaid }: Props) {
  if (state.kind === "nothing") return null;
  const due = state.kind === "unpaid" ? state.owe : state.kind === "short" ? state.rest : null;
  return (
    <View style={styles.box}>
      {due === null ? null : <PayWays host={host} handles={handles} amount={due} />}
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

function PayWays({ host, handles, amount }: { host: string; handles: readonly PaymentHandle[]; amount: Cents }) {
  const c = useColors();
  const links = handles.flatMap((handle) => {
    const href = payLink(handle, amount, note, target);
    return href === null ? [] : [{ handle, href, fallbackHref: payLink(handle, amount, note, "web") ?? href }];
  });
  const zelle = handles.find(({ service }) => service === "zelle");
  // Two or more pills sit side by side under the share, which already shows the amount, so each names only its app and the breakdown's list keeps its height.
  const paired = links.length > 1;
  return (
    <View style={styles.ways}>
      <View style={paired ? styles.pair : styles.ways}>
        {links.map(({ handle, href, fallbackHref }, index) => {
          const app = paymentApps[handle.service];
          const full = say.payOn(host, money(amount), app.name);
          return (
            <View key={handle.service} style={paired && styles.half}>
              <Button kind={index === 0 ? "primary" : "soft"} glyph={app.glyph} label={paired ? app.name : full} name={full} href={href} fallbackHref={fallbackHref} outsideScroll />
            </View>
          );
        })}
      </View>
      {links.length > 0 ? (
        <Text style={[type.caption, styles.handles, { color: c.muted }]}>{links.map(({ handle }) => `${paymentApps[handle.service].name} ${handleText(handle)}`).join(" · ")}</Text>
      ) : null}
      {zelle ? <ZelleCard host={host} handle={zelle.handle} amount={amount} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4 },
  ways: { gap: 10 },
  // A third pill wraps to its own full-width row.
  pair: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  half: { flexGrow: 1, flexBasis: "40%" },
  handles: { textAlign: "center", marginHorizontal: 4 },
  center: { alignItems: "center" },
});
