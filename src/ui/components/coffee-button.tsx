import { StyleSheet, View } from "react-native";

import { coffeeLink, copy } from "../home-copy";
import { Button } from "./button";

/** The coffee cup that opens the maker's Venmo. Its box overlaps the theme toggle's by 12 px, as the toggle's overlaps Share's, so the three glyphs sit 32 px apart. */
export function CoffeeButton() {
  return (
    <View style={styles.pull}>
      <Button kind="icon" icon="coffee" name={copy.coffee} href={coffeeLink} />
    </View>
  );
}

const styles = StyleSheet.create({
  pull: { marginRight: -12 },
});
