import { useEffect, useEffectEvent, useState } from "react";
import { Image, Modal, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/button";
import { copy } from "../home-copy";
import { useReducedMotion, webStyle } from "../motion";
import { breakpoints, motion, type, useColors } from "../theme";

export type Photo = { readonly uri: string; readonly name: string };

type Props = {
  photo: Photo;
  /** Called once the viewer has faded out after a close. */
  onClosed: () => void;
  /** Shown as the camera button on the phone, which replaces the photo. */
  onReplace?: () => void;
};

type Phase = "entering" | "shown" | "leaving";

const photoGround = "#24221F";

export function PhotoViewer({ photo, onClosed, onReplace }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("entering");
  const done = useEffectEvent(onClosed);

  useEffect(() => {
    if (phase === "entering") {
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setPhase((now) => (now === "entering" ? "shown" : now))));
      return () => cancelAnimationFrame(frame);
    }
    if (phase === "leaving") {
      const timer = setTimeout(() => done(), reduce ? motion.reducedFade : motion.photoOut);
      return () => clearTimeout(timer);
    }
  }, [phase, reduce]);

  const close = () => setPhase("leaving");
  const replace = onReplace && (() => {
    onReplace();
    close();
  });
  const shown = phase === "shown";
  const fade = webStyle({
    transitionProperty: reduce ? "opacity" : "opacity, transform",
    transitionDuration: `${reduce ? motion.reducedFade : shown ? motion.photoIn : motion.photoOut}ms`,
    transitionTimingFunction: motion.easeOut,
  });
  const surface = [fade, { opacity: shown ? 1 : 0 }, !reduce && !shown && styles.shrunk];
  const wide = width >= breakpoints.columnFrom;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <View aria-label={photo.name} style={styles.fill}>
        {wide ? (
          <>
            <View testID="photo-scrim" onPointerUp={close} style={[styles.fill, fade, { opacity: shown ? 1 : 0, backgroundColor: c.scrim }]} />
            <View pointerEvents="box-none" style={[styles.fill, styles.center]}>
              <View pointerEvents="box-none" style={[styles.framed, surface]}>
                <View style={[styles.photo, { width: Math.min(540, width - 160), height: Math.min(640, height - 160), backgroundColor: photoGround }]}>
                  <Image source={{ uri: photo.uri }} resizeMode="contain" accessibilityLabel={photo.name} style={styles.fill} />
                </View>
                <Button kind="overPhoto" icon="x" name={copy.closePhoto} onPress={close} outsideScroll />
              </View>
            </View>
          </>
        ) : (
          <View style={[styles.fill, surface, { backgroundColor: photoGround, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={[styles.bar, { paddingLeft: 12 + insets.left, paddingRight: 12 + insets.right }]}>
              <Button kind="onPhoto" icon="x" name={copy.closePhoto} onPress={close} outsideScroll />
              <Text numberOfLines={1} style={[type.label, styles.name]}>
                {photo.name}
              </Text>
              {replace ? <Button kind="onPhoto" icon="camera" name={copy.replace} onPress={replace} outsideScroll /> : <View style={styles.noButton} />}
            </View>
            <Image source={{ uri: photo.uri }} resizeMode="contain" accessibilityLabel={photo.name} style={styles.phonePhoto} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  center: { alignItems: "center", justifyContent: "center" },
  shrunk: { transform: [{ scale: 0.96 }] },
  framed: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginLeft: 56 },
  photo: { borderRadius: 20, overflow: "hidden" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 64 },
  noButton: { width: 44 },
  name: { flex: 1, minWidth: 0, textAlign: "center", color: "#FFFFFF" },
  phonePhoto: { flex: 1, marginHorizontal: 16, marginBottom: 24 },
});
