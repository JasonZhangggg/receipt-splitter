import { useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { motion } from "../theme";

const fadeIn = 200;
const fadeOut = 150;

type Props = {
  /** Names what the content shows. When it changes, the old content fades out, then the new content fades in, so the two never show together. */
  view: string | undefined;
  children: ReactNode;
};

export function Swap({ view, children }: Props) {
  const swapped = useRef<View>(null);
  const [shown, setShown] = useState({ view, children });
  const [outgoing, setOutgoing] = useState<{ view: string | undefined; content: ReactNode } | null>(null);
  if (view !== shown.view) {
    setOutgoing({ view: shown.view, content: shown.children });
    setShown({ view, children });
  } else if (children !== shown.children) setShown({ view, children });
  useLayoutEffect(() => {
    const box = swapped.current as unknown as HTMLElement | null;
    if (outgoing) box?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: fadeIn, delay: fadeOut, easing: motion.easeOut, fill: "backwards" });
  }, [outgoing]);
  return (
    <View>
      <View ref={swapped}>{children}</View>
      {outgoing ? (
        <Outgoing key={outgoing.view} onDone={() => setOutgoing(null)}>
          {outgoing.content}
        </Outgoing>
      ) : null}
    </View>
  );
}

function Outgoing({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  const copy = useRef<View>(null);
  const done = useEffectEvent(onDone);
  useLayoutEffect(() => {
    const node = copy.current as unknown as HTMLElement | null;
    // The copy is a picture of what left, so it gives up the ids and test ids the live content now holds.
    node?.querySelectorAll<HTMLElement>("[id], [data-testid]").forEach((el) => {
      el.removeAttribute("id");
      if (el.dataset.testid) el.dataset.leftTestid = el.dataset.testid;
      delete el.dataset.testid;
    });
    const fade = node?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: fadeOut, easing: motion.easeOut, fill: "forwards" });
    if (!fade) return done();
    fade.onfinish = () => done();
    return () => fade.cancel();
  }, []);
  return (
    <View ref={copy} aria-hidden pointerEvents="none" style={styles.outgoing}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  outgoing: { position: "absolute", top: 0, left: 0, right: 0 },
});
