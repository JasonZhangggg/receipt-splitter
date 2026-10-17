import { StyleSheet, View } from "react-native";

import { coffeeLink, copy } from "../home-copy";
import { Button } from "./button";

/** Home's coffee cup that opens the maker's Venmo. Its box overlaps the theme toggle's by 12 px, as the Split page's toggle overlaps Share, so the two pages space their icons alike. */
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
