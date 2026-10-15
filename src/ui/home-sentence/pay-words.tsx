import { Fragment, type RefObject } from "react";
import type { TextInput } from "react-native";

import { PAYMENT_SERVICES } from "../../core/split";
import type { DraftAction, HandleRow } from "../../draft";
import { copy, paymentApps } from "../home-copy";
import { AppWord } from "./app-word";
import { Blank, Remove, Together, Words } from "./words";

type Props = { handles: readonly HandleRow[]; dispatch: (action: DraftAction) => void; inputs: RefObject<(TextInput | null)[]> };

/** "Friends tap what they had and pay me back on Venmo at @username", with an "or <app> at <handle>" clause for each added way to pay. */
export function PayWords({ handles, dispatch, inputs }: Props) {
  return (
    <>
      <Words>{copy.sentence.friendsPay}</Words>
      {handles.map(({ service, handle }, index) => {
        const app = paymentApps[service];
        const choices = PAYMENT_SERVICES.filter((choice) => choice === service || !handles.some((row) => row.service === choice));
        const field = (
          <Blank
            ref={(input) => {
              inputs.current[index] = input;
            }}
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
        return (
          <Fragment key={service}>
            {index > 0 ? (
              <>
                {" "}
                <Words>{copy.sentence.or}</Words>
              </>
            ) : null}{" "}
            <AppWord service={service} choices={choices} onPick={(next) => dispatch({ type: "setService", index, service: next })} /> <Words>{copy.sentence.at}</Words>{" "}
            {index > 0 ? (
              <Together>
                {field}
                <Remove name={copy.removeApp(app.name)} onPress={() => dispatch({ type: "removeHandle", index })} />
              </Together>
            ) : (
              field
            )}
          </Fragment>
        );
      })}
      .
    </>
  );
}

export const roomForAnotherApp = (handles: readonly HandleRow[]) => handles.length < PAYMENT_SERVICES.length;
