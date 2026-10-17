import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";

import type { Cents } from "../../core/money";
import { money } from "../../draft";
import { copy } from "../home-copy";
import { webStyle } from "../motion";
import { tabular } from "../theme";
import { Act, Words } from "./words";

/** What the phone can see of a read: the reader starting, its own OCR finding the text, the wait on the server's reading, and that wait running long. */
export type ReadingStage = "start" | "text" | "server" | "slow";

/** A read with `total: null` found no Item, so there is no total to show and the clause asks for another photo. */
export type ReceiptState = { readonly kind: "empty" } | { readonly kind: "reading"; readonly stage: ReadingStage } | { readonly kind: "read"; readonly total: Cents | null } | { readonly kind: "byHand" };

const stepIn = { dataSet: { stepIn: "" } };
const shimmer = { dataSet: { shimmer: "" } };
// Focus lands on the clause when the button the person pressed leaves. A ring around the whole clause would only be noise.
const landing = { tabIndex: -1, style: webStyle({ outlineStyle: "none" } as never) } as object;

/** The sentence's first clause: "I paid the bill. Add the receipt.", the step word while it reads, then "I paid $X. Change." or, when no item was read, "I paid the bill. Try another photo." */
export function ReceiptWords({ state, onChoose, onByHand }: { state: ReceiptState; onChoose: () => void; onByHand: () => void }) {
  // Back to a home that already holds a read paints it settled; only a read that finishes in front of the person fades in.
  const [arrived] = useState(state.kind);
  const clause = useRef<Text>(null);
  // "Add the receipt" and the step word unmount under a keyboard user's focus, which would fall to the page. Focus goes to the clause that replaces them.
  useEffect(() => {
    if (state.kind === "empty" || (state.kind === "read" && arrived === "read")) return;
    if (document.activeElement === document.body) (clause.current as unknown as HTMLElement | null)?.focus();
  }, [state.kind, arrived]);
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
        <Text ref={clause} testID="reading" role="status" aria-live="polite" {...landing}>
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
    case "byHand":
      return (
        <Text ref={clause} testID="receipt" {...landing}>
          <Words>{copy.sentence.byHand}</Words> <Act label={copy.change} name={copy.changeReceipt} onPress={onChoose} />
          .
        </Text>
      );
    case "read":
      if (state.total === null)
        return (
          <Text ref={clause} testID="receipt" {...landing} {...(arrived === "read" ? null : stepIn)}>
            <Words>{copy.sentence.paidTheBill}</Words> <Act label={copy.tryAnotherPhoto} onPress={onChoose} />
            , <Words>{copy.sentence.or}</Words> <Act label={copy.addByHand} onPress={onByHand} />
            .
          </Text>
        );
      return (
        <Text ref={clause} testID="receipt" {...landing} {...(arrived === "read" ? null : stepIn)}>
          <Words>{copy.sentence.iPaid}</Words>{" "}
          <Text style={tabular}>
            <Words ink>{money(state.total)}</Words>
          </Text>
          . <Act label={copy.change} name={copy.changeReceipt} onPress={onChoose} />
          .
        </Text>
      );
  }
}
