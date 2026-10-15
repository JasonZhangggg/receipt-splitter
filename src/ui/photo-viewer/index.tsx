import { useEffect, useEffectEvent, useState } from "react";
import { Image, Modal, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, PressTarget } from "../components/button";
import { copy } from "../home-copy";
import { splitCopy as say } from "../split-copy";
import { SheetHeader } from "../split-view/sheet-header";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { breakpoints, layout, motion, type, useColors } from "../theme";

export type Photo = { readonly uri: string; readonly name: string };

type Props = {
  photo: Photo;
  onExited: () => void;
};

type Phase = "entering" | "shown" | "leaving";

const photoGround = "#24221F";

/** The Receipt link's sheet: the photo at a glance, and a tap on it opens the full-screen viewer. */
export function ReceiptSheet({ uri, onOpen, onClose }: { uri: string; onOpen: () => void; onClose: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={styles.sheet}>
      <SheetHeader title={say.receiptPhoto} onClose={onClose} />
      <Text style={[type.body, { color: c.muted }]}>{say.receiptKept}</Text>
      <PressTarget name={say.openPhoto} outsideScroll onPress={onOpen} style={(pressed) => pressStyle(pressed, reduce)}>
        {() => (
          <View style={[styles.thumb, { backgroundColor: c.hairline }]}>
            <Image aria-hidden source={{ uri }} resizeMode="contain" style={styles.fill} />
          </View>
        )}
      </PressTarget>
    </View>
  );
}

export function PhotoViewer({ photo, onExited }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("entering");
  const done = useEffectEvent(onExited);

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
  sheet: { gap: layout.pairGap },
  thumb: { height: 300, borderRadius: 12, overflow: "hidden" },
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
