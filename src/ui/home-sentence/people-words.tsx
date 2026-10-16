import { Fragment, useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from "react";
import type { TextInput } from "react-native";

import { newName } from "../../draft";
import { copy, joinCopy } from "../home-copy";
import { focusInPlace } from "../receipt-input/keyboard-room";
import { Act, Blank, Remove, Together, Words } from "./words";

export type NameField = { readonly open: () => void };

type Props = {
  host: string | null;
  friends: readonly string[];
  onSetHost: (name: string) => void;
  onRemoveHost: () => void;
  onAddFriend: (name: string) => void;
  onRemoveFriend: (name: string) => void;
  /** Why the last typed name was not added, shown by the page under the sentence. */
  onRefusal: (refusal: string | null) => void;
  /** Lets Create open the name field when a name is missing. */
  ref?: Ref<NameField>;
};

/**
 * "I'm <your name>, here with <add friends>." Until the Host's name is in, the blank after "I'm" is its field. Friends have their own field,
 * where "add friends" (or "add more") was, so they can be named first; Enter keeps it open for the next.
 */
export function PeopleWords({ host, friends, onSetHost, onRemoveHost, onAddFriend, onRemoveFriend, onRefusal, ref }: Props) {
  const [adding, setAdding] = useState(false);
  const hostInput = useRef<TextInput | null>(null);
  const friendInput = useRef<TextInput | null>(null);
  const names = host === null ? friends : [host, ...friends];
  const addFriends = () => (adding ? focusInPlace(friendInput.current) : setAdding(true));
  useImperativeHandle(ref, () => ({ open: () => focusInPlace(hostInput.current) }));
  // Only opening the field focuses it. A ref callback would focus again on every render and take the focus back from the field Create just sent the person to.
  useEffect(() => {
    if (adding) focusInPlace(friendInput.current);
  }, [adding]);

  const add = (text: string, onAdd: (name: string) => void): boolean => {
    if (!text.trim()) return false;
    const named = newName(text, names);
    if (!named.ok) {
      onRefusal(named.reason === "nameTaken" ? joinCopy.nameTaken : null);
      return false;
    }
    onAdd(text);
    return true;
  };

  const person = (name: string, you: boolean) => (
    <Together key={name} role="group" aria-label={you ? `${name}, ${copy.you}` : name}>
      <Words ink breaks>
        {name}
      </Words>
      <Remove
        name={copy.removeName(name)}
        onPress={() => {
          onRefusal(null);
          if (you) onRemoveHost();
          else onRemoveFriend(name);
        }}
      />
    </Together>
  );

  const hostField = (
    <NameBlank
      input={hostInput}
      label={copy.yourName}
      placeholder={copy.sentence.yourName}
      onCommit={(text) => add(text, onSetHost)}
      // The Host's Enter goes on to the friends, unless one is already being typed.
      onEnter={(added) => added && !adding && setAdding(true)}
      onLeave={() => {}}
      onRefusal={onRefusal}
    />
  );
  const more = adding ? (
    <NameBlank
      input={friendInput}
      label={copy.newName}
      placeholder={copy.sentence.name}
      onCommit={(text) => add(text, onAddFriend)}
      onEnter={() => {}}
      onLeave={() => setAdding(false)}
      onRefusal={onRefusal}
    />
  ) : (
    <Act label={friends.length ? copy.sentence.addMore : copy.sentence.addFriends} name={copy.addFriendsName} onPress={addFriends} />
  );
  return (
    <>
      <Words>{copy.sentence.iAm}</Words> {host === null ? hostField : person(host, true)}
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

type BlankProps = {
  input: RefObject<TextInput | null>;
  label: string;
  placeholder: string;
  /** Takes what was typed; true when it went in. */
  onCommit: (text: string) => boolean;
  onEnter: (added: boolean) => void;
  /** The field lost focus or Escape was pressed, after what was typed went in. */
  onLeave: () => void;
  onRefusal: (refusal: string | null) => void;
};

/** A name field in the sentence. Enter adds the name and keeps the field; leaving it adds what was typed. */
function NameBlank({ input, label, placeholder, onCommit, onEnter, onLeave, onRefusal }: BlankProps) {
  const [typed, setTyped] = useState("");
  const pressing = usePressing();
  const commit = () => {
    const text = typed;
    setTyped("");
    return onCommit(text);
  };
  return (
    <Blank
      ref={input}
      aria-label={label}
      placeholder={placeholder}
      value={typed}
      enterKeyHint="done"
      autoCapitalize="words"
      onChangeText={(text) => {
        setTyped(text);
        onRefusal(null);
      }}
      onSubmitEditing={() => onEnter(commit())}
      onKeyPress={(event) => {
        if (event.nativeEvent.key !== "Escape") return;
        setTyped("");
        onLeave();
      }}
      submitBehavior="submit"
      blurOnSubmit={false}
      onBlur={() =>
        afterPress(pressing.current, () => {
          if (focused(input.current)) return;
          commit();
          onLeave();
        })
      }
    />
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
