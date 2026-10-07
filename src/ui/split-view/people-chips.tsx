import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import type { Participant, ParticipantId } from "../../core/split";
import type { PaidMark } from "../pay/model";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion, webAnimation, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, motion, type, useColors } from "../theme";

type Props = {
  people: readonly Participant[];
  picked: ReadonlySet<ParticipantId>;
  me: ParticipantId | null;
  marks: ReadonlyMap<ParticipantId, PaidMark>;
  selected: ParticipantId | null;
  onSelect: (id: ParticipantId) => void;
  onAdd: (name: string) => void;
  entering?: boolean;
  label?: string;
};

export function PeopleChips({ people, picked, me, marks, selected, onSelect, onAdd, entering = false, label = say.people }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [typing, setTyping] = useState<string | null>(null);
  const commit = () => {
    if (typing?.trim()) onAdd(typing);
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

  return (
    <View style={styles.row} role="group" aria-label={label}>
      {people.map((person, index) => {
        const isSelected = person.id === selected;
        const away = !picked.has(person.id) && !isSelected;
        const mark = marks.get(person.id);
        const named = person.id === me ? `${person.name}, ${say.you}` : person.name;
        return (
          <View key={person.id} style={enter(index)}>
            <PressTarget
              name={mark ? `${named}, ${mark === "paid" ? say.chipPaid : say.chipPaidPart}` : named}
              outsideScroll
              onPress={() => onSelect(person.id)}
              style={(pressed) => pressStyle(pressed, reduce)}
            >
              {() => (
                <View
                  aria-selected={isSelected}
                  style={[
                    styles.chip,
                    { backgroundColor: isSelected ? c.action : away ? "transparent" : c.sheetIn, boxShadow: away ? `inset 0 0 0 1px ${c.hairline}` : undefined },
                  ]}
                >
                  <Text numberOfLines={1} style={[type.label, styles.name, { color: isSelected ? c.onAction : away ? c.muted : c.ink }]}>
                    {person.name}
                  </Text>
                  {person.id === me ? <Text style={[type.caption, styles.you, { color: isSelected ? c.onAction : c.ink }]}>{say.you}</Text> : null}
                  {mark ? (
                    <View style={styles.mark}>
                      <Icon name={mark === "paid" ? "check" : "checkStruck"} size={markSize} color={isSelected ? c.onAction : away ? c.muted : c.ink} />
                    </View>
                  ) : null}
                </View>
              )}
            </PressTarget>
          </View>
        );
      })}
      {typing === null ? (
        <View style={enter(people.length)}>
          <PressTarget name={say.addPerson} outsideScroll onPress={() => setTyping("")} style={(pressed) => pressStyle(pressed, reduce)}>
            {() => (
              <View style={[styles.chip, styles.add, { boxShadow: `inset 0 0 0 1px ${c.hairline}` }]}>
                <Icon name="plus" size={18} color={c.muted} />
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
    </View>
  );
}

const markSize = 15;
const chipEnterMs = 180;
const stagger = 30;
const staggered = 3;
const chipsEnterFor = chipEnterMs + staggered * stagger;

const chipEnter = webAnimation({
  animationKeyframes: [{ from: { opacity: 0, transform: "scale(0.96)" }, to: { opacity: 1, transform: "none" } }],
  animationDuration: `${chipEnterMs}ms`,
  animationTimingFunction: motion.easeOut,
  animationFillMode: "both",
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", columnGap: layout.chipRowGap, rowGap: layout.pairGap },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44, maxWidth: 160, paddingHorizontal: 14, borderRadius: 22 },
  name: { flexShrink: 1 },
  mark: { flexShrink: 0 },
  you: { opacity: 0.7 },
  add: { width: 44, paddingHorizontal: 0, justifyContent: "center" },
  input: { minHeight: 44, width: 120, paddingHorizontal: 16, borderRadius: 22 },
});
