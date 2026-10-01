import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isRoutableSplitId, type Participant, type ParticipantId, type Split } from "../../src/core/split";
import { rememberSplit, splitOnDevice } from "../../src/device";
import { newName } from "../../src/draft";
import { newParticipantId, useLiveSplit, type GoneReason } from "../../src/live/client";
import { Button, PressTarget } from "../../src/ui/components/button";
import { Icon } from "../../src/ui/components/icon";
import { copy, joinCopy } from "../../src/ui/home-copy";
import { pressStyle, useReducedMotion } from "../../src/ui/motion";
import { type, useColors } from "../../src/ui/theme";

export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const splitId = isRoutableSplitId(id) ? id : null;
  const { live, send } = useLiveSplit(id);
  const [me, setMe] = useState<ParticipantId | null>(() => (splitId && splitOnDevice(splitId).me) || null);

  const join = async (participantId: ParticipantId) => {
    const answer = await send({ type: "setJoined", by: participantId, participantId, joined: true });
    if (!answer.ok || !splitId) return false;
    rememberSplit(splitId, { me: participantId });
    setMe(participantId);
    return true;
  };
  const leave = () => {
    if (me !== null) void send({ type: "setJoined", by: me, participantId: me, joined: false });
    if (splitId) rememberSplit(splitId, { me: null });
    setMe(null);
  };
  const addAndJoin = async (name: string) => {
    const participant = { id: newParticipantId(), name };
    const added = await send({ type: "addParticipant", by: null, participant });
    return added.ok && (await join(participant.id));
  };

  const split = live.status === "live" ? live.split : null;
  const chosen = split?.participants.find((person) => person.id === me) ?? null;

  return (
    <ScrollView style={[styles.screen, { backgroundColor: c.field }]} contentContainerStyle={[styles.page, { paddingTop: 4 + insets.top, paddingBottom: 24 + insets.bottom, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }]}>
      <View style={styles.column}>
        <View style={styles.header}>
          <Text style={[type.wordmark, { color: c.ink }]}>{copy.wordmark}</Text>
        </View>
        {live.status === "connecting" ? (
          <Text role="status" style={[type.secondary, styles.opening, { color: c.muted }]}>
            {joinCopy.opening}
          </Text>
        ) : live.status === "gone" ? (
          <Gone reason={live.reason} />
        ) : chosen ? (
          <Joined split={live.split} me={chosen} onLeave={leave} />
        ) : (
          <WhichOne split={live.split} onJoin={join} onAddAndJoin={addAndJoin} />
        )}
      </View>
    </ScrollView>
  );
}

function Gone({ reason }: { reason: GoneReason }) {
  const c = useColors();
  const words = reason === "notFound" ? joinCopy.expired : joinCopy.unreadable;
  return (
    <View style={styles.gone}>
      <Text role="heading" aria-level={1} style={[type.hero, { color: c.ink }]}>
        {words.title}
      </Text>
      <Text style={[type.secondary, { color: c.muted }]}>{words.hint}</Text>
      <View style={styles.goneAction}>
        <Button kind="soft" label={joinCopy.newSplit} onPress={() => router.replace("/")} />
      </View>
    </View>
  );
}

type WhichOneProps = { split: Split; onJoin: (id: ParticipantId) => Promise<boolean>; onAddAndJoin: (name: string) => Promise<boolean> };

function WhichOne({ split, onJoin, onAddAndJoin }: WhichOneProps) {
  const c = useColors();
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [joinFailed, setJoinFailed] = useState(false);
  const names = split.participants.map(({ name }) => name);
  const choose = async (id: ParticipantId) => setJoinFailed(!(await onJoin(id)));

  const submit = async () => {
    const name = newName(typed, names);
    if (!name) return setProblem(typed.trim() ? joinCopy.nameTaken : joinCopy.nameNeeded);
    setProblem(null);
    if (!(await onAddAndJoin(name))) setProblem(joinCopy.nameRefused);
  };

  return (
    <View style={styles.choose}>
      <Text role="heading" aria-level={1} style={[type.hero, styles.question, { color: c.ink }]}>
        {joinCopy.question}
      </Text>
      <View role="list" style={styles.rows}>
        {split.participants.map((person) => (
          <PersonRow key={person.id} person={person} taken={split.joined.includes(person.id)} onPress={() => choose(person.id)} />
        ))}
      </View>
      {joinFailed ? <Text style={[type.small, styles.problem, { backgroundColor: c.flagWash, color: c.flag }]}>{joinCopy.joinFailed}</Text> : null}
      {adding ? (
        <View style={styles.someoneElse}>
          <TextInput
            autoFocus
            aria-label={joinCopy.yourName}
            placeholder={joinCopy.yourName}
            placeholderTextColor={c.muted}
            value={typed}
            autoCapitalize="words"
            enterKeyHint="go"
            onChangeText={setTyped}
            onSubmitEditing={submit}
            submitBehavior="submit"
            style={[type.body, styles.nameInput, { color: c.ink, backgroundColor: c.paper }]}
          />
          {problem ? <Text style={[type.small, styles.problem, { backgroundColor: c.flagWash, color: c.flag }]}>{problem}</Text> : null}
          <Button label={joinCopy.join} onPress={submit} />
        </View>
      ) : (
        <View style={styles.someoneElseChip}>
          <Button kind="chip" icon="plus" label={joinCopy.someoneElse} onPress={() => setAdding(true)} />
        </View>
      )}
    </View>
  );
}

function PersonRow({ person, taken, onPress }: { person: Participant; taken: boolean; onPress: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View role="listitem">
      <PressTarget onPress={onPress} name={taken ? `${person.name}, ${joinCopy.taken}` : person.name} style={(pressed) => pressStyle(pressed, reduce)}>
        {() => (
          <View style={[styles.person, { backgroundColor: c.paper }]}>
            <Text numberOfLines={1} style={[type.body, styles.personName, { color: c.ink }]}>
              {person.name}
            </Text>
            {taken ? <Text style={[type.caption, { color: c.muted }]}>{joinCopy.taken}</Text> : null}
          </View>
        )}
      </PressTarget>
    </View>
  );
}

function Joined({ split, me, onLeave }: { split: Split; me: Participant; onLeave: () => void }) {
  const c = useColors();
  return (
    <View style={styles.choose}>
      <View style={styles.joinedLine}>
        <Text role="heading" aria-level={1} style={[type.hero, styles.joinedName, { color: c.ink }]} numberOfLines={1}>
          {me.name}
        </Text>
        <Button kind="link" label={joinCopy.notMe(me.name)} onPress={onLeave} />
      </View>
      <View role="group" aria-label={joinCopy.atTheTable} style={styles.table}>
        <Text style={[type.secondary, { color: c.muted }]}>{joinCopy.atTheTable}</Text>
        <View style={styles.chips}>
          {split.participants.map((person) => (
            <View key={person.id} style={[styles.chip, { backgroundColor: c.paper }]}>
              {person.id === me.id ? <Icon name="check" size={16} color={c.ink} /> : null}
              <Text style={[type.label, { color: c.ink }]}>{person.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flexGrow: 1 },
  header: { minHeight: 56, justifyContent: "center", marginBottom: 12 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480 },
  opening: { paddingTop: 24 },
  gone: { gap: 8, paddingTop: 24 },
  goneAction: { marginTop: 16 },
  choose: { gap: 16 },
  question: { marginBottom: 4 },
  rows: { gap: 8 },
  person: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 18, borderRadius: 16 },
  personName: { flex: 1, minWidth: 0 },
  someoneElse: { gap: 10 },
  someoneElseChip: { flexDirection: "row" },
  nameInput: { minHeight: 52, paddingHorizontal: 16, borderRadius: 14 },
  problem: { alignSelf: "flex-start", marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  joinedLine: { flexDirection: "row", alignItems: "center", gap: 12 },
  joinedName: { flexShrink: 1 },
  table: { gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 22 },
});
