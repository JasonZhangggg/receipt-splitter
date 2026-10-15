import { Fragment, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { TextInput } from "react-native";

import { newName } from "../../draft";
import { copy, joinCopy } from "../home-copy";
import { focusInPlace } from "../receipt-input/keyboard-room";
import { Act, Blank, Remove, Together, Words } from "./words";

export type NameField = { readonly open: () => void };

type Props = {
  names: readonly string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  /** Why the last typed name was not added, shown by the page under the sentence. */
  onRefusal: (refusal: string | null) => void;
  /** Lets Create open the name field when a name is missing. */
  ref?: Ref<NameField>;
};

/**
 * "I'm <your name>, here with <add friends>." The first name is the Host. Until it is in, the blank after "I'm" is the field; then the field
 * sits where "add friends" (or "add more") was, after the names, and Enter keeps it open for the next.
 */
export function PeopleWords({ names, onAdd, onRemove, onRefusal, ref }: Props) {
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const pressing = usePressing();
  const input = useRef<TextInput | null>(null);
  // The Host's Enter moves the field from after "I'm" to the end of the list; the old field's blur on the way must not close the new one.
  const moving = useRef(false);
  const [host, ...friends] = names;
  const field = host === undefined ? "host" : adding ? "friend" : null;
  const open = () => (field ? focusInPlace(input.current) : setAdding(true));
  useImperativeHandle(ref, () => ({ open }));
  // Only opening the field focuses it. A ref callback would focus again on every render and take the focus back from the field Create just sent the person to.
  useEffect(() => {
    moving.current = false;
    if (field === "friend") focusInPlace(input.current);
  }, [field]);

  const commit = (): boolean => {
    const text = typed;
    setTyped("");
    if (!text.trim()) return false;
    const named = newName(text, names);
    if (!named.ok) {
      onRefusal(named.reason === "nameTaken" ? joinCopy.nameTaken : null);
      return false;
    }
    onAdd(text);
    return true;
  };

  const blank = (
    <Blank
      key="field"
      ref={input}
      aria-label={field === "host" ? copy.yourName : copy.newName}
      placeholder={field === "host" ? copy.sentence.yourName : copy.sentence.name}
      value={typed}
      enterKeyHint="done"
      autoCapitalize="words"
      onChangeText={(text) => {
        setTyped(text);
        onRefusal(null);
      }}
      onSubmitEditing={() => {
        if (commit() && field === "host") {
          moving.current = true;
          setAdding(true);
        }
      }}
      onKeyPress={(event) => {
        if (event.nativeEvent.key !== "Escape") return;
        setTyped("");
        setAdding(false);
      }}
      submitBehavior="submit"
      blurOnSubmit={false}
      onBlur={() =>
        afterPress(pressing.current, () => {
          if (moving.current || focused(input.current)) return;
          commit();
          setAdding(false);
        })
      }
    />
  );

  const person = (name: string, you: boolean) => (
    <Together key={name} role="group" aria-label={you ? `${name}, ${copy.you}` : name}>
      <Words ink breaks>
        {name}
      </Words>
      <Remove
        name={copy.removeName(name)}
        onPress={() => {
          onRefusal(null);
          onRemove(name);
        }}
      />
    </Together>
  );

  const more = field === "friend" ? blank : <Act quiet label={friends.length ? copy.sentence.addMore : copy.sentence.addFriends} name={copy.addFriendsName} onPress={open} />;
  return (
    <>
      <Words>{copy.sentence.iAm}</Words> {host === undefined ? blank : person(host, true)}
      , <Words>{copy.sentence.hereWith}</Words>{" "}
      {friends.map((name, index) => (
        <Fragment key={name}>
          {person(name, false)}
          {index < friends.length - 1 ? "," : null}{" "}
        </Fragment>
      ))}
      {friends.length ? (
        <>
          <Words>{copy.sentence.and}</Words>{" "}
        </>
      ) : null}
      {more}
      .
    </>
  );
}

const pressEnds = ["pointerup", "pointercancel"] as const;

/** Whether a pointer is down, so a blur caused by a press waits for the press to land before the field closes under it. */
function usePressing() {
  const pressing = useRef(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const down = () => (pressing.current = true);
    const up = () => (pressing.current = false);
    document.addEventListener("pointerdown", down, true);
    for (const end of pressEnds) document.addEventListener(end, up, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      for (const end of pressEnds) document.removeEventListener(end, up, true);
    };
  }, []);
  return pressing;
}

const focused = (field: TextInput | null) => field !== null && (field as unknown as Element) === globalThis.document?.activeElement;

function afterPress(pressing: boolean, run: () => void) {
  if (!pressing) return run();
  const release = () => {
    for (const end of pressEnds) document.removeEventListener(end, release);
    setTimeout(run);
  };
  for (const end of pressEnds) document.addEventListener(end, release);
}
