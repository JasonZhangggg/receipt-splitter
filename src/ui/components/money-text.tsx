import { Text } from "react-native";

import { type } from "../theme";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number) {
  return usd.format(cents / 100);
}

const sizes = { row: type.moneyRow, total: type.moneyTotal, body: type.moneyBody };

type Props = { cents: number; size?: keyof typeof sizes; color: string };

export function MoneyText({ cents, size = "row", color }: Props) {
  return <Text style={[sizes[size], { color }]}>{formatCents(cents)}</Text>;
}
