import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, type TextInput } from "react-native";

import { MAX_HOME_PLACE_LENGTH, placeOf } from "../../draft";
import { PressTarget } from "../components/button";
import { linkPress } from "../components/text-link";
import { copy } from "../home-copy";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { focusInPlace } from "../receipt-input/keyboard-room";
import { useColors } from "../theme";
import { useSaySize } from "./say-size";
import { afterPress, Blank, focused, Glued, padded, useComposed, usePressing } from "./words";

// At headline size a long place is wider than the line: it ends in an ellipsis, short of the edge by room for its period.
const roomForPeriod = webStyle({ maxWidth: "calc(100% - 14px)" } as never);

type Props = {
  place: string;
  /** The punctuation right after it. */
  then: string;
  /** Takes what was typed. An empty field removes the place. */
  onChange: (name: string) => void;
  /** Where focus goes when the place is gone, since the word it was on has left the page. */
  onRemoved: () => void;
};

/**
 * The place in "I paid $X at <place>.": ink words over a light rule, which a tap turns into a field in the same spot, like the name blanks.
 * Enter or leaving the field keeps the edit, Escape drops it, and an empty field removes the place.
 */
export function PlaceWord({ place, then, onChange, onRemoved }: Props) {
  const [typed, setTyped] = useState<string | null>(null);
  const field = useRef<TextInput | null>(null);
  const word = useRef<Text>(null);
  const refocus = useRef(false);
  const pressing = usePressing();
  const composedRef = useComposed(field);
  const c = useColors();
  const reduce = useReducedMotion();
  const size = useSaySize();
  const editing = typed !== null;
  // Only opening the field focuses it, and only closing it with the keyboard puts the focus back, so a tap elsewhere keeps the focus where it went.
  useEffect(() => {
    if (editing) focusInPlace(field.current);
    else if (refocus.current) {
      refocus.current = false;
      (word.current as unknown as HTMLElement | null)?.closest<HTMLElement>("[role=button]")?.focus();
    }
  }, [editing]);

  const close = (text: string | null, keyboard: boolean) => {
    refocus.current = keyboard;
    if (text !== null && text !== place) {
      onChange(text);
      // A field left with no name the server takes removes the place, and the word the focus returns to goes with it.
      if (keyboard && placeOf(text) === null) onRemoved();
    }
    setTyped(null);
  };

  if (typed === null) {
    return (
      <Glued then={then}>
        <PressTarget name={copy.placeName(place)} onPress={() => setTyped(place)} style={(pressed) => [styles.word, roomForPeriod, padded(size), pressStyle(pressed, reduce, linkPress)]}>
          {() => (
            <Text ref={word} numberOfLines={1} style={[size.input, { borderBottomWidth: size.rule, color: c.ink, borderBottomColor: c.dash }]}>
              {place}
            </Text>
          )}
        </PressTarget>
      </Glued>
    );
  }
  return (
    <Blank
      ref={field}
      aria-label={copy.placeField}
      value={typed}
      maxLength={MAX_HOME_PLACE_LENGTH}
      enterKeyHint="done"
      autoCapitalize="words"
      autoCorrect={false}
      spellCheck={false}
      onChangeText={setTyped}
      onSubmitEditing={() => close(typed, true)}
      onKeyPress={(event) => {
        const key = event.nativeEvent as unknown as KeyboardEvent;
        // iOS and an input method's confirming Enter arrive as keyCode 229 and must not close the field twice or mid-composition.
        if (key.key === "Enter" && key.keyCode === 229 && !key.isComposing && !composedRef.current) close(typed, true);
        if (key.key === "Enter") composedRef.current = false;
        if (key.key === "Escape") close(null, true);
      }}
      submitBehavior="submit"
      blurOnSubmit={false}
      then={then}
      onBlur={() =>
        afterPress(pressing.current, () => {
          if (!focused(field.current)) close(typed, false);
        })
      }
    />
  );
}

const styles = StyleSheet.create({
  word: { alignItems: "baseline" },
});
