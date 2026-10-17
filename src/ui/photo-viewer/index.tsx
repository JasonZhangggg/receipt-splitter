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
  onExited: () => void;
};

type Phase = "entering" | "shown" | "leaving";

const photoGround = "#0E0E0E";
// The phone's ground is always dark, so its focus ring is white whatever the page's theme.
const onDark = webStyle({ "--focus": "#FFFFFF" } as never);
// The frame is this box with the photo's shape inside it. A photo that has not told its size in this long gets the whole box.
const frameMax = { width: 540, height: 640 };
const sizeWait = 300;

type Size = { readonly width: number; readonly height: number };

function useSize(uri: string) {
  const [size, setSize] = useState<Size | "unknown" | null>(null);
  useEffect(() => {
    const wait = setTimeout(() => setSize((now) => now ?? "unknown"), sizeWait);
    Image.getSize(
      uri,
      (width, height) => setSize(width > 0 && height > 0 ? { width, height } : "unknown"),
      () => setSize("unknown"),
    );
    return () => clearTimeout(wait);
  }, [uri]);
  return size;
}

/** The largest frame within `box` that has the photo's shape. */
function fit(photo: Size | "unknown" | null, box: Size): Size {
  if (photo === null || photo === "unknown") return box;
  const scale = Math.min(box.width / photo.width, box.height / photo.height);
  return { width: Math.round(photo.width * scale), height: Math.round(photo.height * scale) };
}

export function PhotoViewer({ photo, onExited }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("entering");
  const done = useEffectEvent(onExited);
  const size = useSize(photo.uri);
  const frame = fit(size, { width: Math.min(frameMax.width, width - 160), height: Math.min(frameMax.height, height - 160) });

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
  // On a wide screen the frame waits for the photo's shape, so it opens at its size and never resizes under the eye.
  const shown = phase === "shown" && (width < breakpoints.columnFrom || size !== null);
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
                <View style={[styles.photo, { width: frame.width, height: frame.height, backgroundColor: photoGround }]}>
                  <Image source={{ uri: photo.uri }} resizeMode="contain" accessibilityLabel={photo.name} style={styles.fill} />
                </View>
                <Button kind="overPhoto" icon="x" name={copy.closePhoto} onPress={close} outsideScroll />
              </View>
            </View>
          </>
        ) : (
          <View style={[styles.fill, surface, onDark, { backgroundColor: photoGround, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={[styles.bar, { paddingLeft: 12 + insets.left, paddingRight: 12 + insets.right }]}>
              <Button kind="onPhoto" icon="x" name={copy.closePhoto} onPress={close} outsideScroll />
              <Text numberOfLines={1} style={[type.body, styles.name]}>
                {photo.name}
              </Text>
              <View style={styles.noButton} />
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
