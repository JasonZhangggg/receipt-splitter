import { Fragment, useEffect, useRef, type RefObject } from "react";
import { Text, type TextInput } from "react-native";

import type { Currency } from "../../core/currency";
import { paysIn } from "../../core/pay-links";
import { PAYMENT_SERVICES } from "../../core/split";
import type { DraftAction, HandleRow } from "../../draft";
import type { Press } from "../components/button";
import { copy, paymentApps } from "../home-copy";
import { focusInPlace } from "../receipt-input/keyboard-room";
import { AppWord } from "./app-word";
import { Blank, nowrap, Remove, Words } from "./words";

type Props = {
  handles: readonly HandleRow[];
  dispatch: (action: DraftAction) => void;
  inputs: RefObject<(TextInput | null)[]>;
  /** The clause whose app menu is open, or null. */
  menu: number | null;
  onMenu: (index: number, press: Press) => void;
};

/**
 * "Friends tap what they had and pay me back on Venmo at @username.", with an "or <app> at <handle>" clause for each added way to pay. The app's
 * name opens the app menu, which also adds the next way. With more than one, each app's name has an x that takes its clause away.
 */
export function PayWords({ handles, dispatch, inputs, menu, onMenu }: Props) {
  const count = useRef(handles.length);
  // A new clause's field takes the focus, so the handle can be typed straight away.
  useEffect(() => {
    const added = handles.length > count.current;
    count.current = handles.length;
    if (added) focusInPlace(inputs.current[handles.length - 1] ?? null);
  }, [handles.length, inputs]);
  const several = handles.length > 1;
  return (
    <>
      <Words>{copy.sentence.friendsPay}</Words>
      {handles.map(({ service, handle }, index) => {
        const app = paymentApps[service];
        const last = index === handles.length - 1;
        const field = (
          <Blank
            ref={(input) => {
              inputs.current[index] = input;
            }}
            then={last ? "." : undefined}
            aria-label={`${app.name} handle`}
            value={handle}
            placeholder={app.hint}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            enterKeyHint="done"
            onChangeText={(text) => dispatch({ type: "setHandle", index, handle: text })}
          />
        );
        // Removing one of two leaves the other app's name as the place the focus goes.
        const other = handles.length === 2 ? paymentApps[handles[1 - index].service].name : null;
        return (
          <Fragment key={service}>
            {" "}
            {/* "on" or "or" keeps to the app's name, so the line breaks before both and the sentence wraps the same in Geist and its fallback. */}
            <Text style={nowrap}>
              <Words>{index > 0 ? copy.sentence.or : copy.sentence.on}</Words> <AppWord service={service} open={menu === index} onOpen={(press) => onMenu(index, press)} />
              {several ? <Remove name={copy.removeApp(app.name)} others={handles.length > 2} fallback={`${copy.paymentApp}, ${other}`} onAppWord onPress={() => dispatch({ type: "removeHandle", index })} /> : null}
            </Text>{" "}
            <Words>{copy.sentence.at}</Words> {field}
          </Fragment>
        );
      })}
    </>
  );
}

/** The apps a clause can switch to: its own, and every one no other clause uses, of those that send the currency. */
export const appChoices = (handles: readonly HandleRow[], index: number, currency: Currency) =>
  PAYMENT_SERVICES.filter((choice) => paysIn(choice, currency) && (choice === handles[index]?.service || !handles.some((row) => row.service === choice)));

export const roomForAnotherApp = (handles: readonly HandleRow[], currency: Currency) => handles.length < PAYMENT_SERVICES.filter((app) => paysIn(app, currency)).length;
