import { useState, type Ref } from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";

import { webStyle } from "../motion";
import { motion, type, useColors } from "../theme";

const underlined = { dataSet: { underline: "" } };
const colorChange = webStyle({ transitionProperty: "border-color", transitionDuration: `${motion.dragOver}ms`, transitionTimingFunction: "ease" });

type Props = TextInputProps & { ref?: Ref<TextInput> };

/** A text field with a thin rule under it that darkens on focus, in place of a ring. */
export function UnderlineInput({ style, onFocus, onBlur, placeholderTextColor, ref, ...rest }: Props) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      {...underlined}
      placeholderTextColor={placeholderTextColor ?? c.muted}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[type.input, styles.field, colorChange, { color: c.ink, borderBottomColor: focused ? c.ink : c.hairline }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  field: { minWidth: 0, paddingVertical: 4, paddingHorizontal: 0, borderBottomWidth: 1 },
});
