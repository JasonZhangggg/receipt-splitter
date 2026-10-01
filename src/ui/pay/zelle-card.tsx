import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Cents } from "../../core/money";
import { plainAmount } from "../../draft";
import { Button } from "../components/button";
import { paymentApps } from "../home-copy";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

const copiedFor = 1600;

export function ZelleCard({ host, handle, amount }: { host: string; handle: string; amount: Cents }) {
  const c = useColors();
  const [problem, setProblem] = useState(false);
  return (
    <View style={styles.box}>
      <View testID="zelle" style={[styles.card, { backgroundColor: c.sheetIn }]}>
        <View style={styles.head}>
          <View style={[styles.glyph, { backgroundColor: c.ink }]}>
            <Text style={[type.glyph, { color: c.sheetIn }]}>{paymentApps.zelle.glyph}</Text>
          </View>
          <Text style={[type.button, { color: c.ink }]}>{say.payOnZelle(host)}</Text>
        </View>
        <CopyRow shown={handle} value={handle} onFail={() => setProblem(true)} />
        <CopyRow shown={`$${plainAmount(amount)}`} value={plainAmount(amount)} onFail={() => setProblem(true)} />
      </View>
      {problem ? <Text style={[type.small, styles.problem, { backgroundColor: c.flagWash, color: c.flag }]}>{say.copyValueFailed}</Text> : null}
    </View>
  );
}

function CopyRow({ shown, value, onFail }: { shown: string; value: string; onFail: () => void }) {
  const c = useColors();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), copiedFor);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => navigator.clipboard.writeText(value).then(() => setCopied(true), onFail);
  return (
    <View style={[styles.row, { borderTopColor: c.hairline }]}>
      <Text selectable numberOfLines={1} style={[type.body, styles.value, { color: c.ink }]}>
        {shown}
      </Text>
      <Button kind="link" icon={copied ? "check" : "copy"} label={copied ? say.copied : say.copy} name={copied ? say.copied : say.copyValue(shown)} onPress={() => void copy()} outsideScroll />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  card: { borderRadius: 16, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 54, paddingHorizontal: 14 },
  glyph: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingLeft: 14, paddingRight: 10, borderTopWidth: 1 },
  value: { flex: 1, minWidth: 0, fontVariant: ["tabular-nums"] },
  problem: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
