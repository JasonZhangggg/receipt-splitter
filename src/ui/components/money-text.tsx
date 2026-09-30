import { Text } from "react-native";

import { formatCents } from "../money";
import { type } from "../theme";

const sizes = { row: type.moneyRow, total: type.moneyTotal, body: type.moneyBody };

type Props = { cents: number; size?: keyof typeof sizes; color: string };

export function MoneyText({ cents, size = "row", color }: Props) {
  return <Text style={[sizes[size], { color }]}>{formatCents(cents)}</Text>;
}
