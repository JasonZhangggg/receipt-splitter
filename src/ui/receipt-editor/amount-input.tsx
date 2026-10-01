import { useRef, useState } from "react";
import { TextInput, type StyleProp, type TextStyle } from "react-native";

import type { Cents } from "../../core/money";
import { parseAmount, plainAmount } from "../../draft";
import { useColors } from "../theme";

type Selectable = { target: unknown; preventDefault(): void };

const selectAll = ({ target }: Selectable) => (target as HTMLInputElement).select();

type Props = {
  amount: number;
  label: string;
  onChange: (amount: Cents) => void;
  allowNegative?: boolean;
  prefix?: string;
  editable?: boolean;
  style: StyleProp<TextStyle>;
};

export function AmountInput({ amount, label, onChange, allowNegative = false, prefix = "", editable = true, style }: Props) {
  const c = useColors();
  const [typing, setTyping] = useState<string | null>(null);
  const focusedByPointer = useRef(false);
  const selection = {
    onMouseDown: (event: Selectable) => {
      focusedByPointer.current = document.activeElement !== event.target;
    },
    onMouseUp: (event: Selectable) => {
      if (!focusedByPointer.current) return;
      focusedByPointer.current = false;
      event.preventDefault();
      selectAll(event);
    },
  };
  return (
    <TextInput
      aria-label={label}
      value={typing ?? (amount === 0 ? "" : amount < 0 ? `-${prefix}${plainAmount(-amount)}` : `${prefix}${plainAmount(amount)}`)}
      inputMode="decimal"
      editable={editable}
      placeholder={`${prefix}0.00`}
      enterKeyHint="done"
      onFocus={(event) => {
        if (!focusedByPointer.current) selectAll(event);
      }}
      {...selection}
      placeholderTextColor={c.muted}
      onBlur={() => setTyping(null)}
      onChangeText={(text) => {
        const cents = parseAmount(text.replace(prefix, ""), allowNegative);
        if (cents === null) return;
        setTyping(text);
        onChange(cents);
      }}
      style={style}
    />
  );
}
