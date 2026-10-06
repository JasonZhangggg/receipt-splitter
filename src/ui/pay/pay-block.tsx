import { useState } from "react";
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
import { ZelleCard, ZellePill } from "./zelle-card";

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
  const [problem, setProblem] = useState(false);
  const [only] = handles;
  if (handles.length === 1 && only.service === "zelle") return <ZelleCard host={host} handle={only.handle} amount={amount} />;
  // Two or more ways share one row under the share, which already shows the amount, so each names only its app and the breakdown's list keeps its height. Three or more drop the app marks so all of them fit one row.
  const row = handles.length > 1;
  const marks = handles.length < 3;
  return (
    <View style={styles.ways}>
      <View style={row ? styles.row : styles.ways}>
        {handles.map((handle, index) => {
          const app = paymentApps[handle.service];
          const href = payLink(handle, amount, note, target);
          const pill =
            href === null ? (
              <ZellePill host={host} handle={handle.handle} amount={amount} primary={index === 0} onFail={() => setProblem(true)} />
            ) : (
              <Button
                kind={index === 0 ? "primary" : "soft"}
                glyph={marks ? app.glyph : undefined}
                label={row ? app.name : say.payOn(host, money(amount), app.name)}
                name={say.payOn(host, money(amount), app.name)}
                href={href}
                fallbackHref={payLink(handle, amount, note, "web") ?? href}
                outsideScroll
                snug={row}
              />
            );
          return (
            <View key={handle.service} style={row && (marks ? styles.half : styles.fit)}>
              {pill}
            </View>
          );
        })}
      </View>
      {/* A long line breaks after a dot, never before one or between an app and its handle. */}
      {handles.length > 0 ? (
        <Text style={[type.caption, styles.handles, { color: c.muted }]}>{handles.map((handle) => `${paymentApps[handle.service].name}\u00a0${handleText(handle)}`).join("\u00a0· ")}</Text>
      ) : null}
      {problem ? <Text style={[type.small, styles.handles, { color: c.muted }]}>{say.copyValueFailed}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4 },
  ways: { gap: 10 },
  // On a phone narrower than the pills they wrap to a second row rather than squeeze their names.
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  half: { flexGrow: 1, flexBasis: "40%" },
  fit: { flexGrow: 1, flexBasis: "auto" },
  handles: { textAlign: "center", marginHorizontal: 4 },
  center: { alignItems: "center" },
});
