import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { Participant, ParticipantId } from "../../core/split";
import type { PaidMark } from "../pay/model";
import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion, webAnimation, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";

type Props = {
  people: readonly Participant[];
  me: ParticipantId | null;
  marks: ReadonlyMap<ParticipantId, PaidMark>;
  selected: ParticipantId | null;
  onSelect: (id: ParticipantId) => void;
  onAdd: (name: string) => void;
  /** A long-press or right-click on anyone but the Host. */
  onHold?: (id: ParticipantId, press: Press) => void;
  /** The side-by-side layout: the chips wrap onto several lines instead of scrolling on one. */
  wrap?: boolean;
  entering?: boolean;
  label?: string;
};

type Ghost = { readonly person: Participant; readonly mark: PaidMark | undefined };

export function PeopleChips({ people, me, marks, selected, onSelect, onAdd, onHold, wrap = false, entering = false, label = say.people }: Props) {
  const c = useColors();
  // Wrapped chips reflow across lines and the pane changes height, so on desktop a removal closes up in one frame, with no slide or fade.
  const reduce = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const chips = useRef(new Map<ParticipantId, HTMLElement>());
  const offsets = useRef(new Map<ParticipantId, number>());
  const follow = useRef(false);
  const [typing, setTyping] = useState<string | null>(null);
  const commit = () => {
    if (typing?.trim()) {
      follow.current = true;
      onAdd(typing);
    }
    setTyping(null);
  };
  const [entrance, setEntrance] = useState(entering);
  const [wasEntering, setWasEntering] = useState(entering);
  if (entering !== wasEntering) {
    setWasEntering(entering);
    if (entering) setEntrance(true);
  }
  useEffect(() => {
    if (!entrance) return;
    const timer = setTimeout(() => setEntrance(false), chipsEnterFor);
    return () => clearTimeout(timer);
  }, [entrance]);
  const enter = (index: number) => (entrance && !reduce ? [chipEnter, webStyle({ animationDelay: `${Math.min(index, staggered) * stagger}ms` })] : null);

  // A person who leaves fades where their chip stood while the chips after it slide over, so the row closes the gap without a jump.
  const [ghosts, setGhosts] = useState<readonly Ghost[]>([]);
  const [shownPeople, setShownPeople] = useState(people);
  // The marks as last drawn: the new Split no longer knows a removed person paid, and their chip must not lose its check as it fades.
  const [shownMarks, setShownMarks] = useState(marks);
  if (marks !== shownMarks) setShownMarks(marks);
  if (people !== shownPeople) {
    setShownPeople(people);
    const gone = reduce || wrap ? [] : shownPeople.filter((person) => !people.some(({ id }) => id === person.id));
    const kept = ghosts.filter(({ person }) => !people.some(({ id }) => id === person.id));
    if (gone.length > 0 || kept.length !== ghosts.length) setGhosts([...kept, ...gone.map((person) => ({ person, mark: shownMarks.get(person.id) }))]);
  }
  const ghostNodes = useRef(new Map<ParticipantId, HTMLElement>());
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const before = offsets.current;
    for (const [id, node] of ghostNodes.current) {
      if (node.dataset.placed) continue;
      node.dataset.placed = "1";
      node.style.left = `${before.get(id) ?? 0}px`;
      node.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.96)" }], { duration: chipLeaveMs, easing: motion.easeOut, fill: "forwards" }).onfinish = () =>
        setGhosts((all) => all.filter(({ person }) => person.id !== id));
    }
    const leaving = ghosts.length > 0;
    const after = new Map<ParticipantId, number>();
    for (const [id, node] of chips.current) {
      after.set(id, node.offsetLeft);
      const from = before.get(id);
      if (!leaving || reduce || from === undefined || from === node.offsetLeft) continue;
      // Additive, so a second removal mid-slide adds its own move to the one still running instead of jumping.
      node.animate([{ transform: `translateX(${from - node.offsetLeft}px)` }, { transform: "none" }], { duration: chipLeaveMs, easing: motion.easeOut, composite: "add" });
    }
    offsets.current = after;
  });


  // The field as it opens, and a chip this row just added, scroll into view at the row's end.
  const opened = typing !== null;
  const count = people.length;
  useLayoutEffect(() => {
    if (!opened && !follow.current) return;
    follow.current = false;
    // Setting scrollLeft moves the row in WebKit, where the ScrollView's scrollToEnd leaves it in place.
    const box = scroller.current?.getScrollableNode() as HTMLElement | undefined;
    if (!box) return;
    // A few pixels to the field's ring need no glide; a whole new chip does.
    box.style.scrollBehavior = reduce || box.scrollWidth - box.clientWidth - box.scrollLeft < glideFrom ? "auto" : "smooth";
    box.scrollLeft = box.scrollWidth;
    box.style.scrollBehavior = "";
  }, [opened, count, reduce]);

  // The scroll padding stops a chip scrolled into view on the gutter, not on the screen edge.
  const seenSelected = useRef(selected);
  useLayoutEffect(() => {
    if (selected === seenSelected.current) return;
    seenSelected.current = selected;
    if (wrap) return;
    (selected === null ? undefined : chips.current.get(selected))?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: reduce ? "instant" : "smooth" });
  });

  // A mouse wheel only scrolls down, so over the row it scrolls the row sideways, as long as the row has somewhere to go.
  useEffect(() => {
    const box = wrap || Platform.OS !== "web" ? undefined : (scroller.current?.getScrollableNode() as HTMLElement | undefined);
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaX !== 0 || event.deltaY === 0 || event.ctrlKey) return;
      const next = Math.max(0, Math.min(box.scrollWidth - box.clientWidth, box.scrollLeft + event.deltaY));
      if (next === box.scrollLeft) return;
      event.preventDefault();
      box.scrollLeft = next;
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [wrap]);

  // Each end of the row fades out over as much as is scrolled away, up to fadeMax,, so a chip at rest is crisp and the fade grows with the scroll. It is painted by the mask, so it never takes a tap.
  useEffect(() => {
    const box = wrap || Platform.OS !== "web" ? undefined : (scroller.current?.getScrollableNode() as HTMLElement | undefined);
    if (!box) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const hidden = { left: Math.floor(box.scrollLeft), right: Math.floor(box.scrollWidth - box.clientWidth - box.scrollLeft) };
      box.style.setProperty(fadeLeft, `${Math.max(0, Math.min(fadeMax, hidden.left))}px`);
      box.style.setProperty(fadeRight, `${Math.max(0, Math.min(fadeMax, hidden.right))}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    box.addEventListener("scroll", schedule, { passive: true });
    const sizes = new ResizeObserver(schedule);
    sizes.observe(box);
    if (box.firstElementChild) sizes.observe(box.firstElementChild);
    return () => {
      cancelAnimationFrame(frame);
      box.removeEventListener("scroll", schedule);
      sizes.disconnect();
    };
  }, [wrap]);

  const face = (person: Participant, mark: PaidMark | undefined) => {
    // Two looks only: the selected chip in ink, everyone else in one quiet fill, whether or not they have picked their name.
    const isSelected = person.id === selected;
    const ink = isSelected ? c.onAction : c.ink;
    return (
      <View aria-selected={isSelected} style={[styles.chip, { backgroundColor: isSelected ? c.action : c.off }]}>
        <Text numberOfLines={1} selectable={false} style={[type.label, styles.name, { color: ink }]}>
          {person.name}
        </Text>
        {person.id === me ? (
          <Text selectable={false} style={[type.caption, styles.you, { color: ink }]}>
            {say.you}
          </Text>
        ) : null}
        {mark ? (
          <View style={[styles.mark, mark !== "paid" && styles.narrow]}>
            <Icon name={mark === "paid" ? "check" : "exclaim"} size={markSize} color={ink} />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View role="group" aria-label={label}>
      <Row wrap={wrap} scroller={scroller}>
        {people.map((person, index) => {
          const mark = marks.get(person.id);
          const named = person.id === me ? `${person.name}, ${say.you}` : person.name;
          return (
            <View
              key={person.id}
              ref={track(chips, person.id)}
              style={enter(index)}
            >
              <PressTarget
                name={mark ? `${named}, ${{ paid: say.chipPaid, short: say.chipPaidShort, over: say.chipPaidOver }[mark]}` : named}
                onPress={() => onSelect(person.id)}
                onLongPress={index === 0 || !onHold ? undefined : (press) => onHold(person.id, press)}
                style={(pressed) => pressStyle(pressed, reduce)}
              >
                {() => face(person, mark)}
              </PressTarget>
            </View>
          );
        })}
        {typing === null ? (
          <View style={enter(people.length)}>
            <PressTarget name={say.addPerson} onPress={() => setTyping("")} style={(pressed) => pressStyle(pressed, reduce)}>
              {() => (
                <View style={[styles.chip, styles.add, { backgroundColor: c.off }]}>
                  <Icon name="plus" size={18} color={c.ink} />
                </View>
              )}
            </PressTarget>
          </View>
        ) : (
          <TextInput
            autoFocus
            aria-label={say.newPerson}
            placeholder={say.newPerson}
            placeholderTextColor={c.muted}
            value={typing}
            autoCapitalize="words"
            enterKeyHint="done"
            onChangeText={setTyping}
            onSubmitEditing={commit}
            submitBehavior="submit"
            onBlur={commit}
            style={[type.input, styles.input, { color: c.ink, backgroundColor: c.sheetIn }]}
          />
        )}
        {ghosts.map(({ person, mark }) => (
          <View
            key={`gone-${person.id}`}
            aria-hidden
            pointerEvents="none"
            ref={track(ghostNodes, person.id)}
            style={[styles.ghost, { top: ringRoom }]}
          >
            {face(person, mark)}
          </View>
        ))}
      </Row>
    </View>
  );
}

/** The phone's one-row scroller, or on desktop a plain row that wraps. */
function Row({ wrap, scroller, children }: { wrap: boolean; scroller: React.RefObject<ScrollView | null>; children: React.ReactNode }) {
  if (wrap) return <View style={styles.wrapRow}>{children}</View>;
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={[{ margin: -ringRoom }, rowScroll, rowFade, webStyle({ scrollPaddingInline: `${ringRoom}px` })]}
      contentContainerStyle={[styles.row, { padding: ringRoom }]}
    >
      {children}
    </ScrollView>
  );
}

/** A ref that keeps `nodes` in step with what is mounted, by person. */
const track = (nodes: { readonly current: Map<ParticipantId, HTMLElement> }, id: ParticipantId) => (view: View | null) => {
  if (view) nodes.current.set(id, view as unknown as HTMLElement);
  else nodes.current.delete(id);
};

const markSize = 15;
const chipEnterMs = 180;
const chipLeaveMs = 200;
const stagger = 30;
const staggered = 3;
const chipsEnterFor = chipEnterMs + staggered * stagger;
// The scroller's clip box reaches this far past the chips on every side, so the 3 px focus ring outside a chip or the name field is not cut, with a pixel to spare for fractional chip widths. The chips stay on the page gutter.
const ringRoom = 4;
const glideFrom = 24;
// The longest fade at each clip edge, 4 px of it over the ring room, so a chip sitting on the gutter loses at most its outer 16 px to the fade while names are hidden beyond it.
const fadeMax = 20;

const chipEnter = webAnimation({
  animationKeyframes: [{ from: { opacity: 0, transform: "scale(0.96)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: `${chipEnterMs}ms`,
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});

// The row owns sideways drags; a vertical one still reaches the sheet's drag. A swipe at the row's end does not go back a page.
const rowScroll = webStyle({ touchAction: "pan-x", overscrollBehaviorX: "contain" });

const fadeLeft = "--fade-left";
const fadeRight = "--fade-right";
const fadeMask = `linear-gradient(to right, transparent 0, #000 var(${fadeLeft}, 0px), #000 calc(100% - var(${fadeRight}, 0px)), transparent 100%)`;
const rowFade = webStyle({ maskImage: fadeMask, WebkitMaskImage: fadeMask });

const styles = StyleSheet.create({
  wrapRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: layout.chipRowGap, rowGap: layout.pairGap },
  row: { flexDirection: "row", alignItems: "center", columnGap: layout.chipRowGap },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44, maxWidth: 160, paddingHorizontal: 14, borderRadius: 22 },
  name: { flexShrink: 1 },
  mark: { flexShrink: 0 },
  // The "!" is a thin stroke in a square glyph box, so it would sit farther from the name than the check does.
  narrow: { marginHorizontal: -3 },
  you: { opacity: 0.7 },
  add: { width: 44, paddingHorizontal: 0, justifyContent: "center" },
  input: { minHeight: 44, width: 120, paddingHorizontal: 16, borderRadius: 22 },
  ghost: { position: "absolute" },
});
