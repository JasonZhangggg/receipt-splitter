import { useState } from "react";
import { TextInput, type StyleProp, type TextStyle } from "react-native";

import type { Cents } from "../../core/money";
import { parseAmount, plainAmount } from "../../draft";
import { useColors } from "../theme";

type Props = {
  amount: number;
  label: string;
  onChange: (amount: Cents) => void;
  allowNegative?: boolean;
  prefix?: string;
  style: StyleProp<TextStyle>;
};

export function AmountInput({ amount, label, onChange, allowNegative = false, prefix = "", style }: Props) {
  const c = useColors();
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <TextInput
      aria-label={label}
      value={typing ?? (amount < 0 ? `-${prefix}${plainAmount(-amount)}` : `${prefix}${plainAmount(amount)}`)}
      inputMode="decimal"
      placeholder="0.00"
      enterKeyHint="done"
      selectTextOnFocus
      placeholderTextColor={c.muted}
      onFocus={() => setTyping(amount === 0 ? "" : plainAmount(amount))}
      onBlur={() => setTyping(null)}
      onChangeText={(text) => {
        const cents = parseAmount(text, allowNegative);
        if (cents === null) return;
        setTyping(text);
        onChange(cents);
      }}
      style={style}
    />
  );
}
