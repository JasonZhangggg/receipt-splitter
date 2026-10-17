import { useEffect, useRef, useState } from "react";

export type View = { readonly scale: number; readonly x: number; readonly y: number };
export type Box = { readonly width: number; readonly height: number };

export const rest: View = { scale: 1, x: 0, y: 0 };
export const maxScale = 5;
/** A double click zooms to this much, and a double click while zoomed goes back. */
export const clickScale = 2.5;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The view with its photo kept over the whole frame, so a pan never shows the ground behind it. The view's origin is the frame's top left. */
export function keepCovering({ scale, x, y }: View, box: Box): View {
  return { scale, x: clamp(x, box.width * (1 - scale), 0), y: clamp(y, box.height * (1 - scale), 0) };
}

/** The view at `scale` that holds the photo point under (px, py), in frame px, where it was. */
export function zoomAt(view: View, scale: number, px: number, py: number, box: Box): View {
  const next = clamp(scale, 1, maxScale);
  const ratio = next / view.scale;
  return keepCovering({ scale: next, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio }, box);
}

/** The scale after a wheel turn. A trackpad pinch arrives as small ctrl-wheel steps, and a mouse wheel as large ones, so both land on the same curve. */
export const scaleAfterWheel = (scale: number, deltaY: number) => scale * Math.exp(-clamp(deltaY, -100, 100) * 0.01);

const glideMs = 240;

/** Zoom for the desktop photo viewer: double click or + / - / 0 to zoom, ctrl-wheel or a trackpad pinch to zoom at the pointer, drag or scroll to pan once zoomed. A touch keeps the browser's own pinch. */
export function usePhotoZoom(enabled: boolean, reduce: boolean, easing: string) {
  const [host, setFrame] = useState<HTMLElement | null>(null);
  const [content, setLayer] = useState<HTMLElement | null>(null);
  const view = useRef<View>(rest);

  useEffect(() => {
    if (!enabled || !host || !content) return;

    const box = (): Box => ({ width: host.clientWidth, height: host.clientHeight });
    const show = (next: View, animate: boolean) => {
      view.current = next;
      content.style.transition = animate && !reduce ? `transform ${glideMs}ms ${easing}` : "none";
      content.style.transformOrigin = "0 0";
      content.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
      host.style.cursor = next.scale > 1 ? "grab" : "";
    };
    const at = (event: { clientX: number; clientY: number }) => {
      const edge = host.getBoundingClientRect();
      return [event.clientX - edge.left, event.clientY - edge.top] as const;
    };

    let pan: { id: number; x: number; y: number; from: View } | null = null;

    const onWheel = (event: WheelEvent) => {
      const now = view.current;
      if (event.ctrlKey) {
        event.preventDefault();
        const [px, py] = at(event);
        show(zoomAt(now, scaleAfterWheel(now.scale, event.deltaY), px, py, box()), false);
      } else if (now.scale > 1) {
        event.preventDefault();
        show(keepCovering({ ...now, x: now.x - event.deltaX, y: now.y - event.deltaY }, box()), false);
      }
    };
    const onDoubleClick = (event: MouseEvent) => {
      const now = view.current;
      const [px, py] = at(event);
      show(now.scale > 1 ? rest : zoomAt(now, clickScale, px, py, box()), true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0 || view.current.scale <= 1) return;
      pan = { id: event.pointerId, x: event.clientX, y: event.clientY, from: view.current };
      host.setPointerCapture(event.pointerId);
      host.style.cursor = "grabbing";
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pan || pan.id !== event.pointerId) return;
      show(keepCovering({ ...pan.from, x: pan.from.x + event.clientX - pan.x, y: pan.from.y + event.clientY - pan.y }, box()), false);
      host.style.cursor = "grabbing";
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (pan?.id !== event.pointerId) return;
      pan = null;
      host.style.cursor = view.current.scale > 1 ? "grab" : "";
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const now = view.current;
      const middle = [host.clientWidth / 2, host.clientHeight / 2] as const;
      if (event.key === "+" || event.key === "=") show(zoomAt(now, now.scale * 1.5, ...middle, box()), true);
      else if (event.key === "-") show(zoomAt(now, now.scale / 1.5, ...middle, box()), true);
      else if (event.key === "0") show(rest, true);
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("dblclick", onDoubleClick);
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerEnd);
    host.addEventListener("pointercancel", onPointerEnd);
    document.addEventListener("keydown", onKey);
    return () => {
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("dblclick", onDoubleClick);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerEnd);
      host.removeEventListener("pointercancel", onPointerEnd);
      document.removeEventListener("keydown", onKey);
    };
  }, [enabled, host, content, reduce, easing]);

  return { setFrame, setLayer };
}
