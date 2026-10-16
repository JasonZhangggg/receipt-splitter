import { Fragment, useEffect, useRef, type RefObject } from "react";
import { Text, type TextInput } from "react-native";

import { PAYMENT_SERVICES } from "../../core/split";
import type { DraftAction, HandleRow } from "../../draft";
import { copy, paymentApps } from "../home-copy";
import { webStyle } from "../motion";
import { focusInPlace } from "../receipt-input/keyboard-room";
import { AppWord } from "./app-word";
import { Act, Blank, Remove, Together, Words } from "./words";

type Props = { handles: readonly HandleRow[]; dispatch: (action: DraftAction) => void; inputs: RefObject<(TextInput | null)[]> };

/**
 * "Friends tap what they had and pay me back on Venmo at @username, or add an app.", with an "or <app> at <handle>" clause for each added way
 * to pay. With more than one, each app's name has an x that takes its clause away.
 */
export function PayWords({ handles, dispatch, inputs }: Props) {
  const adding = useRef(false);
  // A new clause's field takes the focus, so the handle can be typed straight away.
  useEffect(() => {
    if (!adding.current) return;
    adding.current = false;
    focusInPlace(inputs.current[handles.length - 1] ?? null);
  }, [handles.length, inputs]);
  const several = handles.length > 1;
  return (
    <>
      <Words>{copy.sentence.friendsPay}</Words>
      {handles.map(({ service, handle }, index) => {
        const app = paymentApps[service];
        const choices = PAYMENT_SERVICES.filter((choice) => choice === service || !handles.some((row) => row.service === choice));
        const word = <AppWord service={service} choices={choices} onPick={(next) => dispatch({ type: "setService", index, service: next })} />;
        return (
          <Fragment key={service}>
            {" "}
            {/* "on" or "or" keeps to the app's name, so the line breaks before both and the sentence wraps the same in Geist and its fallback. */}
            <Text style={together}>
              <Words>{index > 0 ? copy.sentence.or : copy.sentence.on}</Words>{" "}
              {several ? (
                <Together>
                  {word}
                  <Remove name={copy.removeApp(app.name)} onAppWord onPress={() => dispatch({ type: "removeHandle", index })} />
                </Together>
              ) : (
                word
              )}
            </Text>{" "}
            <Words>{copy.sentence.at}</Words>{" "}
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
          </Fragment>
        );
      })}
      {roomForAnotherApp(handles) ? (
        <>
          , <Words>{copy.sentence.or}</Words>{" "}
          <Act
            label={copy.sentence.addApp}
            name={copy.addAppName}
            onPress={() => {
              adding.current = true;
              dispatch({ type: "addHandle" });
            }}
          />
        </>
      ) : null}
      .
    </>
  );
}

const together = webStyle({ whiteSpace: "nowrap" } as never);

export const roomForAnotherApp = (handles: readonly HandleRow[]) => handles.length < PAYMENT_SERVICES.length;
