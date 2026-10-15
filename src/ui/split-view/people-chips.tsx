import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import type { Participant, ParticipantId } from "../../core/split";
import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { layout, type, useColors } from "../theme";
import { usePersonInks } from "../person-inks";

type Props = {
  people: readonly Participant[];
  me: ParticipantId | null;
  selected: ParticipantId | null;
  onSelect: (id: ParticipantId) => void;
  onAdd: (name: string) => void;
  /** A long-press or right-click on anyone but the Host. */
  onHold?: (id: ParticipantId, press: Press) => void;
  label?: string;
};

/** Everyone in the Split as chips that wrap onto lines. The selected chip is the person whose side the list shows. B2-7 replaces this with the People sheet's rows. */
export function PeopleChips({ people, me, selected, onSelect, onAdd, onHold, label = say.people }: Props) {
  const c = useColors();
  const inkOf = usePersonInks(people.map(({ id }) => id));
  const reduce = useReducedMotion();
  const [typing, setTyping] = useState<string | null>(null);
  const commit = () => {
    if (typing?.trim()) onAdd(typing);
    setTyping(null);
  };

  const face = (person: Participant) => {
    // Two looks only: the selected chip in ink with a ring set off by a gap, everyone else on a quiet fill with a dot in their own hue.
    const isSelected = person.id === selected;
    const ink = isSelected ? c.onAction : c.ink;
    return (
      <View aria-selected={isSelected} style={[styles.chip, { backgroundColor: isSelected ? c.action : c.sheetIn }, isSelected && { boxShadow: `0 0 0 2px ${c.sheet}, 0 0 0 4px ${c.action}` }]}>
        {isSelected ? null : <View style={[styles.dot, { backgroundColor: inkOf(person.id).mark }]} />}
        <Text numberOfLines={1} selectable={false} style={[type.body, styles.name, { color: ink }]}>
          {person.name}
        </Text>
        {person.id === me ? (
          <View style={styles.mark}>
            <Icon name="person" size={youSize} color={ink} />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View role="group" aria-label={label} style={styles.row}>
      {people.map((person, index) => (
        <PressTarget
          key={person.id}
          name={person.id === me ? `${person.name}, ${say.you}` : person.name}
          onPress={() => onSelect(person.id)}
          onLongPress={index === 0 || !onHold ? undefined : (press) => onHold(person.id, press)}
          style={(pressed) => pressStyle(pressed, reduce)}
        >
          {() => face(person)}
        </PressTarget>
      ))}
      {typing === null ? (
        <PressTarget name={say.addPerson} onPress={() => setTyping("")} style={(pressed) => pressStyle(pressed, reduce)}>
          {() => (
            <View style={[styles.chip, styles.add, { backgroundColor: c.off }]}>
              <Icon name="plus" size={18} color={c.ink} />
            </View>
          )}
        </PressTarget>
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

const youSize = 13;

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: layout.chipRowGap, rowGap: layout.pairGap },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44, maxWidth: 160, paddingHorizontal: 14, borderRadius: 22 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  name: { flexShrink: 1 },
  mark: { flexShrink: 0 },
  add: { width: 44, paddingHorizontal: 0, justifyContent: "center" },
  input: { minHeight: 44, width: 120, paddingHorizontal: 16, borderRadius: 22 },
});
