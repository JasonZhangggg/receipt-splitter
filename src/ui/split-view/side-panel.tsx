import { cloneElement, createContext, useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { tabbable } from "../components/popover";
import { useReducedMotion, webAnimation, webStyle } from "../motion";
import { motion, SurfaceContext } from "../theme";

/** New content fades in over 120ms, opacity only, from its first painted frame. The column swaps content on nearly every click, so anything longer reads as lag, and old content leaves at once rather than fading: a fade out followed by a fade in leaves the column blank between them. */
const fadeIn = webAnimation({ animationKeyframes: [{ from: { opacity: 0 }, to: { opacity: 1 } }], animationDuration: "120ms", animationTimingFunction: motion.easeOut, animationFillMode: "both" });
const contain = webStyle({ overscrollBehavior: "contain" });

type Props = {
  children: ReactNode;
  label: string;
  /** Calls `onDown` at once, where a sheet would first slide down. */
  closing?: boolean;
  onDown?: () => void;
  /** Opened from the keyboard: focus moves to the first control inside, as a sheet's does, instead of staying behind the whole receipt in tab order. */
  focusFirst?: boolean;
  testID?: string;
};

/** What a bottom sheet holds on a phone, shown in the wide layout's right column instead. It is not modal: the receipt beside it stays in reach. */
export function SidePanel({ children, label, closing = false, onDown, focusFirst = false, testID }: Props) {
  const region = useRef<View>(null);
  const [focusOnOpen] = useState(focusFirst);
  // Read once: a panel that slid in keeps no fade, and one that faded in does not fade again when a later push settles.
  const [fades] = useState(useContext(FadesIn));
  useEffect(() => {
    if (focusOnOpen) (region.current as unknown as HTMLElement | null)?.querySelector<HTMLElement>(tabbable)?.focus({ preventScroll: true });
  }, [focusOnOpen]);
  const down = useEffectEvent(() => onDown?.());
  useEffect(() => {
    if (closing) down();
  }, [closing]);
  return (
    <SurfaceContext value="page">
      <View ref={region} role="region" aria-label={label} testID={testID} style={[styles.panel, fades && fadeIn]}>
        <ScrollView style={[styles.scroll, contain]} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      </View>
    </SurfaceContext>
  );
}

/** False while a panel slides in, which then carries it in alone. */
const FadesIn = createContext(true);

type Role = "rest" | "in" | "inBack" | "out" | "outBack";

/** Where each push starts and ends. Going deeper, the new view comes in from the right and the one it covers drifts a third of the way left; going back runs the same path the other way. */
const offscreen = { in: "translateX(100%)", inBack: "translateX(-30%)" } as const;
const away = { out: "translateX(-30%)", outBack: "translateX(100%)" } as const;

/**
 * One view of the column on its way in, at rest, or on its way out. Only the content moves: the column has no ground of its own, so its color holds through the slide.
 * The leaving view fades out in the first half of the slide, so the two never read as one jumble, and the incoming one fades in as it arrives.
 * Every move starts from wherever a running one had got to, so a click back mid-slide turns the views around without a jump.
 */
function Slide({ role, onOut, children }: { role: Role; onOut?: () => void; children: ReactNode }) {
  const self = useRef<View>(null);
  const out = useEffectEvent(() => onOut?.());
  useLayoutEffect(() => {
    const element = self.current as unknown as HTMLElement | null;
    if (!element?.animate) return;
    const leaving = role === "out" || role === "outBack";
    element.inert = leaving;
    if (role === "rest") return;
    const running = element.getAnimations();
    const { opacity, transform } = getComputedStyle(element);
    running.forEach((animation) => animation.cancel());
    const fill = leaving ? "forwards" : "none";
    const move = element.animate([{ transform: running.length ? transform : leaving ? "none" : offscreen[role] }, { transform: leaving ? away[role] : "none" }], { duration: motion.columnPush, easing: motion.easeDrawer, fill });
    element.animate([{ opacity: running.length ? opacity : leaving ? 1 : 0 }, { opacity: leaving ? 0 : 1 }], { duration: leaving ? motion.columnPush / 2 : motion.columnPush, easing: motion.easeOut, fill });
    move.onfinish = () => {
      if (leaving) out();
    };
  }, [role]);
  return (
    <View ref={self} aria-hidden={role === "out" || role === "outBack" ? true : undefined} style={styles.slide}>
      <FadesIn value={role === "rest"}>{children}</FadesIn>
    </View>
  );
}

type Shown = { readonly node: ReactElement; readonly depth: number; readonly mount: number };
type Leaving = { readonly node: ReactElement; readonly back: boolean; readonly mount: number };

/**
 * The wide column as a stack of views. Your share sits at depth 0; a view opened over it (an item, People, Payments, the pick) sits at depth 1.
 * Opening one pushes it in from the right and closing it slides it back out, so the change of view reads at a glance. One view over Your share replaced by another, such as a click from one item to the next, pushes the same way as opening it. Your share swapped for someone else's keeps the panel's quick fade.
 * Each child is a keyed SidePanel. The one leaving stays mounted until its slide ends, so it keeps its state and scroll while it moves.
 * Every view that comes in mounts fresh, as it did before the column slid, even one reopened while its last copy is still on the way out.
 */
export function ColumnStack({ depth, children }: { depth: number; children: ReactElement }) {
  const reduce = useReducedMotion();
  // The view on screen as it was last drawn, which is what slides away when another takes its place.
  const [shown, setShown] = useState<Shown>({ node: children, depth, mount: 0 });
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [entering, setEntering] = useState<Role>("rest");
  if (shown.node.key !== children.key) {
    const pushed = !reduce && (depth !== shown.depth || depth > 0);
    setShown({ node: children, depth, mount: shown.mount + 1 });
    setEntering(pushed ? (depth < shown.depth ? "inBack" : "in") : "rest");
    // A share swapped for another's leaves a slide that is still running to finish on its own.
    if (pushed) setLeaving({ node: shown.node, back: depth < shown.depth, mount: shown.mount });
  } else if (shown.node !== children) setShown({ ...shown, node: children, depth });
  const gone = leaving?.mount;
  return (
    <View style={styles.stack}>
      {leaving ? (
        <Slide key={leaving.mount} role={leaving.back ? "outBack" : "out"} onOut={() => setLeaving((now) => (now?.mount === gone ? null : now))}>
          {cloneElement(leaving.node as ReactElement<Props>, { testID: undefined })}
        </Slide>
      ) : null}
      <Slide key={shown.mount} role={entering}>
        {children}
      </Slide>
    </View>
  );
}

// Past the widest overhang in a sheet: the Close button's 44pt target hangs 14px beyond the content edge.
const bleed = 16;

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 0 },
  // Reaches `bleed` past the column like the scroller does, so it clips a sliding view at the same edges the scroller already clips at.
  stack: { flex: 1, minHeight: 0, marginHorizontal: -bleed, overflow: "hidden" },
  slide: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, paddingHorizontal: bleed },
  // The scroller reaches `bleed` past the column on each side and the content pads it back in, so the content sits where it did. Controls that hang past their row (a link's tap area, the Close button's) then stay inside the scroller, which would otherwise scroll sideways to show them and clip the column's left edge.
  scroll: { flex: 1, marginHorizontal: -bleed },
  // Room on the sides and top for a focused field's ring, which the scroller clips.
  content: { paddingTop: 4, paddingBottom: 32, paddingHorizontal: 4 + bleed },
});
