import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { glyph, type IconName } from "./icon-glyphs";

export type { IconName };

// A press goes to the button under the glyph: React Native Web's Pressable misses a touch whose target is one of the shapes.
const box = { display: "block", flexShrink: 0, pointerEvents: "none" } as const;

const hoverGrace = 600;
const playFor = 900;

/** Says whether a pointer event should (re)start the motion: a press right after a hover lets the hover's motion finish. */
export function replayGate(now: () => number) {
  let hoveredAt = -Infinity;
  return (type: "pointerdown" | "pointerover") => {
    if (type === "pointerover") {
      hoveredAt = now();
      return true;
    }
    return now() - hoveredAt >= hoverGrace;
  };
}

const appears = new Set(["check", "alert"]);

function useReplay(motion: string | undefined) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    if (motion && appears.has(motion) && document.documentElement.hasAttribute("data-icons-live")) ref.current?.setAttribute("data-appear", "");
  }, [motion]);
  useEffect(() => {
    const icon = ref.current;
    if (!icon || !motion) return;
    const host = icon.closest<HTMLElement>("[data-pressable], button, a");
    if (!host) return;
    const allow = replayGate(() => performance.now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const play = (type: "pointerdown" | "pointerover") => {
      if (type === "pointerover" && icon.hasAttribute("data-play")) return;
      if (!allow(type)) return;
      icon.removeAttribute("data-play");
      void icon.getBoundingClientRect();
      icon.setAttribute("data-play", "");
      clearTimeout(timer);
      timer = setTimeout(() => icon.removeAttribute("data-play"), playFor);
    };
    const off = () => host.getAttribute("aria-disabled") === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onPointer = (event: PointerEvent) => {
      if (off()) return;
      const type = event.type as "pointerdown" | "pointerover";
      if (type === "pointerover" && (event.pointerType !== "mouse" || host.contains(event.relatedTarget as Node | null))) return;
      play(type);
    };
    host.addEventListener("pointerdown", onPointer);
    host.addEventListener("pointerover", onPointer);
    return () => {
      clearTimeout(timer);
      host.removeEventListener("pointerdown", onPointer);
      host.removeEventListener("pointerover", onPointer);
    };
  }, [motion]);
  return ref;
}

// Inline vector shapes paint in the frame that adds them; an image source can paint blank until it decodes.
export function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  const { svg, weight = 1.6, motion } = glyph(name);
  const ref = useReplay(motion);
  // React 19 sets innerHTML again whenever the prop object is a new one, even with the same string, and that restarts a running tick or pulse on every render.
  const html = useMemo(() => ({ __html: svg }), [svg]);
  return (
    <svg
      ref={ref}
      aria-hidden
      data-icon={name}
      className={motion ? `ai ai-${motion}` : undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={box}
      dangerouslySetInnerHTML={html}
    />
  );
}
