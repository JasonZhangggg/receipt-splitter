import { useState } from "react";
import { Text } from "react-native";

import type { Cents } from "../../core/money";
import { money } from "../../draft";
import { copy } from "../home-copy";
import { tabular } from "../theme";
import { Act, Words } from "./words";

/** What the phone can see of a read: the reader starting, its own OCR finding the text, the wait on the server's reading, and that wait running long. */
export type ReadingStage = "start" | "text" | "server" | "slow";

export type ReceiptState = { readonly kind: "empty" } | { readonly kind: "reading"; readonly stage: ReadingStage } | { readonly kind: "read"; readonly total: Cents };

const stepIn = { dataSet: { stepIn: "" } };
const shimmer = { dataSet: { shimmer: "" } };

/** The sentence's first clause: "I paid the bill. Add the receipt.", the step word while it reads, then "I paid $X. Change." */
export function ReceiptWords({ state, onChoose }: { state: ReceiptState; onChoose: () => void }) {
  // Back to a home that already holds a read paints it settled; only a read that finishes in front of the person fades in.
  const [arrived] = useState(state.kind);
  switch (state.kind) {
    case "empty":
      return (
        <>
          <Words>{copy.sentence.paidTheBill}</Words> <Act label={copy.addReceipt} onPress={onChoose} />
          .
        </>
      );
    case "reading":
      return (
        <Text role="status" aria-live="polite" aria-label={copy.reading}>
          <Words>{copy.sentence.paidTheBill}</Words>{" "}
          {/* A new key swaps the word in one commit, so the old step never shares a frame with the new one. */}
          <Text key={state.stage} {...stepIn}>
            <Text testID="reading-stage" {...shimmer}>
              {copy.readingStage[state.stage]}
            </Text>
          </Text>
          .
        </Text>
      );
    case "read":
      return (
        <Text testID="receipt" {...(arrived === "read" ? null : stepIn)}>
          <Words>{copy.sentence.iPaid}</Words>{" "}
          <Text style={tabular}>
            <Words ink>{money(state.total)}</Words>
          </Text>
          . <Act quiet label={copy.change} name={copy.changeReceipt} onPress={onChoose} />
          .
        </Text>
      );
  }
}
