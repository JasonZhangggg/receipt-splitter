import type { NativeSyntheticEvent, TextInputChangeEventData } from "react-native";

/** A name starts with a capital. */
export const withCapital = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/**
 * What was typed in a name field, with its first letter capitalized. iOS turns Shift on for the first letter only after the person empties the
 * field themselves, not when the field opens or the app clears it after a name goes in. Text an input method is still composing is left alone.
 */
export function typedName(event: NativeSyntheticEvent<TextInputChangeEventData>): string {
  const { text } = event.nativeEvent;
  return (event.nativeEvent as { isComposing?: boolean }).isComposing ? text : withCapital(text);
}
