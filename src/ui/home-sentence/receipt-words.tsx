import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";

import type { Cents } from "../../core/money";
import { money } from "../../draft";
import { copy } from "../home-copy";
import { webStyle } from "../motion";
import { tabular, useColors } from "../theme";
import { PlaceWord } from "./place-word";
import { Act, Glued, Words } from "./words";

/** What the phone can see of a read: the reader starting, its own OCR finding the text, the wait on the server's reading, and that wait running long. */
export type ReadingStage = "start" | "text" | "server" | "slow";

/** A read with `total: null` found no Item, so there is no total to show and the clause asks for another photo. */
export type ReceiptState = { readonly kind: "empty" } | { readonly kind: "reading"; readonly stage: ReadingStage } | { readonly kind: "read"; readonly total: Cents | null; readonly place: string | null } | { readonly kind: "byHand" };

const stepIn = { dataSet: { stepIn: "" } };
const rollIn = { dataSet: { stepRollIn: "" } };
// Focus lands on the clause when the button the person pressed leaves. A ring around the whole clause would only be noise.
const landing = { tabIndex: -1, style: webStyle({ outlineStyle: "none" } as never) } as object;

/** The sentence's first clause: "I paid the bill. Add the receipt.", the step word while it reads, then "I paid $X at <place>. Change." (the place only when the server read one; a tap on it edits it) or, when no item was read, "I paid the bill. Try another photo." */
export function ReceiptWords({ state, onChoose, onByHand, onPlace }: { state: ReceiptState; onChoose: () => void; onByHand: () => void; onPlace: (name: string) => void }) {
  // Back to a home that already holds a read paints it settled; only a read that finishes in front of the person fades in.
  const [arrived] = useState(state.kind);
  const clause = useRef<Text>(null);
  const c = useColors();
  // The step word each new one replaces, so it can roll out as the new one rolls in.
  const stage = state.kind === "reading" ? state.stage : null;
  const [steps, setSteps] = useState<{ now: ReadingStage | null; before: ReadingStage | null }>({ now: stage, before: null });
  if (steps.now !== stage) setSteps({ now: stage, before: steps.now });
  // "Add the receipt" and the step word unmount under a keyboard user's focus, which would fall to the page. Focus goes to the clause that replaces them.
  useEffect(() => {
    if (state.kind === "empty" || (state.kind === "read" && arrived === "read")) return;
    if (document.activeElement === document.body) (clause.current as unknown as HTMLElement | null)?.focus();
  }, [state.kind, arrived]);
  switch (state.kind) {
    case "empty":
      return (
        <>
          <Words>{copy.sentence.paidTheBill}</Words> <Act label={copy.addReceipt} onPress={onChoose} then="." />
        </>
      );
    case "reading":
      return (
        <Text ref={clause} testID="reading" role="status" aria-live="polite" {...landing}>
          <Words>{copy.sentence.paidTheBill}</Words>{" "}
          {/* A new key swaps the word in one commit, so the old step is never text beside the new one. It only rolls out as css.ts's ::before. */}
          <Glued then=".">
            <Text key={state.stage} testID="reading-stage" style={{ color: c.ink }} {...{ dataSet: { stepRoll: "", ...(steps.before && { stepFrom: copy.readingStage[steps.before] }) } }}>
              <Text {...rollIn}>
                <Words ink>{copy.readingStage[state.stage]}</Words>
              </Text>
            </Text>
          </Glued>
        </Text>
      );
    case "byHand":
      return (
        <Text ref={clause} testID="receipt" {...landing}>
          <Words>{copy.sentence.byHand}</Words> <Act label={copy.change} name={copy.changeReceipt} onPress={onChoose} then="." quiet />
        </Text>
      );
    case "read":
      if (state.total === null)
        return (
          <Text ref={clause} testID="receipt" {...landing} {...(arrived === "read" ? null : stepIn)}>
            <Words>{copy.sentence.paidTheBill}</Words> <Act label={copy.tryAnotherPhoto} onPress={onChoose} then="," />{" "}
            <Words>{copy.sentence.or}</Words> <Act label={copy.addByHand} onPress={onByHand} then="." />
          </Text>
        );
      return (
        <Text ref={clause} testID="receipt" {...landing}>
          <Words>{copy.sentence.iPaid}</Words>{" "}
          {/* Only the amount and the place are new; "I paid" and "Change" were there as words already. */}
          <Text {...(arrived === "read" ? null : stepIn)}>
            <Text style={tabular}>
              <Words ink>{money(state.total)}</Words>
            </Text>
            {state.place === null ? null : (
              <>
                {" "}
                <Words>{copy.sentence.at}</Words> <PlaceWord place={state.place} then="." onChange={onPlace} onRemoved={() => (clause.current as unknown as HTMLElement | null)?.focus()} />
              </>
            )}
          </Text>
          {state.place === null ? "." : null} <Act label={copy.change} name={copy.changeReceipt} onPress={onChoose} then="." quiet />
        </Text>
      );
  }
}
