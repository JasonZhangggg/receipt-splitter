import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cents } from "../../src/core/money";
import type { Operation } from "../../src/core/operations";
import { computeShares } from "../../src/core/shares";
import { isRoutableSplitId, type ItemId, type ParticipantId, type Split, type SplitId, type SplitItem } from "../../src/core/split";
import { rememberSplit, splitOnDevice, thisDevice, type SplitOnDevice } from "../../src/device";
import { newName, plainAmount } from "../../src/draft";
import { newParticipantId, splitUrl, useLiveSplit, type GoneReason } from "../../src/live/client";
import { Button } from "../../src/ui/components/button";
import { HistorySheet } from "../../src/ui/history";
import { joinCopy } from "../../src/ui/home-copy";
import { ItemSheet } from "../../src/ui/item-sheet";
import { splitCopy as say } from "../../src/ui/split-copy";
import { Breakdown } from "../../src/ui/split-view/breakdown";
import { SplitHeader } from "../../src/ui/split-view/header";
import { LinkLine } from "../../src/ui/split-view/link-line";
import { OweLine } from "../../src/ui/split-view/owe-line";
import { circleTap } from "../../src/ui/split-view/model";
import { PeopleChips } from "../../src/ui/split-view/people-chips";
import { PickSheet } from "../../src/ui/split-view/pick-sheet";
import { ReceiptCard } from "../../src/ui/split-view/receipt-card";
import { SpringSheet } from "../../src/ui/split-view/spring-sheet";
import { type, useColors } from "../../src/ui/theme";

export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const splitId = isRoutableSplitId(id) ? id : null;
  const { live, send } = useLiveSplit(id);

  if (live.status === "live" && splitId) return <SplitPage key={splitId} splitId={splitId} split={live.split} send={send} />;
  return (
    <View style={[styles.screen, { backgroundColor: c.field, paddingTop: insets.top, paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }]}>
      <View style={styles.column}>
        <SplitHeader />
        {live.status === "gone" ? (
          <Gone reason={live.reason} />
        ) : (
          <Text role="status" style={[type.secondary, styles.opening, { color: c.muted }]}>
            {joinCopy.opening}
          </Text>
        )}
      </View>
    </View>
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

/** pick is the tall sheet, collapsing the 80 ms check and the spring down after a pick, and regular the chips and what you owe. */
type Phase = "pick" | "collapsing" | "regular";
type Overlay = { readonly kind: "item"; readonly itemId: ItemId } | { readonly kind: "history" } | null;
type Send = ReturnType<typeof useLiveSplit>["send"];

const checkFor = 80;
/** The tall sheet's top sits 170 px down the screen, so the receipt still peeks out above it. */
const tallPickTop = 170;
const settleFor = 420;

function SplitPage({ splitId, split, send }: { splitId: SplitId; split: Split; send: Send }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [device] = useState(thisDevice);
  const [memory, setMemory] = useState<SplitOnDevice>(() => splitOnDevice(splitId));
  const remember = (change: Parameters<typeof rememberSplit>[1]) => {
    rememberSplit(splitId, change);
    setMemory(splitOnDevice(splitId));
  };
  const held = split.picks.find((pick) => pick.participantId === memory.me);
  const me = memory.me && held && (held.device === undefined || held.device === device) ? memory.me : null;
  const [phase, setPhase] = useState<Phase>(me ? "regular" : "pick");
  const [chosen, setChosen] = useState<ParticipantId | null>(null);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<ParticipantId | null>(me);
  const [expanded, setExpanded] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [closing, setClosing] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const shares = useMemo(() => computeShares(split), [split]);
  const people = split.participants;
  const [host] = people;
  const picked = new Set(split.picks.map(({ participantId }) => participantId));
  const selectedPerson = people.find((person) => person.id === (selected ?? me)) ?? null;
  const creating = memory.creatorSecret !== undefined;
  const act = (op: Operation) => send(op).then((answer) => answer.ok);

  const choose = async (participantId: ParticipantId, takeOver: boolean) => {
    setPickProblem(null);
    setChosen(participantId);
    if (!(await act({ by: participantId, type: "pick", participantId, device, takeOver }))) {
      setChosen(null);
      return setPickProblem(say.pickFailed);
    }
    remember({ me: participantId });
    setSelected(participantId);
    timers.current.push(
      setTimeout(() => setPhase("collapsing"), checkFor),
      setTimeout(() => {
        setPhase("regular");
        setChosen(null);
      }, checkFor + settleFor),
    );
  };

  const addYourself = async (typed: string) => {
    const name = newName(typed, people.map(({ name: other }) => other));
    if (!name) return typed.trim() ? say.nameTaken : say.nameNeeded;
    const participant = { id: newParticipantId(), name };
    if (!(await act({ by: null, type: "addParticipant", participant }))) return say.nameRefused;
    await choose(participant.id, false);
    return null;
  };

  const addPerson = async (typed: string) => {
    const name = newName(typed, people.map(({ name: other }) => other));
    if (!name) return null;
    const participant = { id: newParticipantId(), name };
    return (await act({ by: me, type: "addParticipant", participant })) ? participant.id : null;
  };

  const onCircle = async (item: SplitItem) => {
    if (!me || !selectedPerson) return setPhase("pick");
    for (const op of circleTap(item, selectedPerson.id)) await act({ ...op, by: me });
  };

  const onChip = (participantId: ParticipantId) => {
    if (participantId === selected && expanded) {
      setExpanded(false);
      return setSelected(me);
    }
    setSelected(participantId);
    setExpanded(true);
  };

  const share = async () => {
    const url = splitUrl(splitId);
    remember({ shared: true });
    if (typeof navigator.share === "function") await navigator.share({ url }).catch(() => {});
    else await navigator.clipboard?.writeText(url).catch(() => {});
  };

  const closeOverlay = () => setClosing(true);
  const overlayGone = () => {
    setOverlay(null);
    setClosing(false);
  };

  const myShare = shares.shares.find((row) => row.participantId === me)?.share ?? cents(0);
  const regular = (
    <View style={styles.regular}>
      <PeopleChips
        people={people}
        picked={picked}
        me={me}
        selected={me ? (selectedPerson?.id ?? null) : null}
        entering={phase === "collapsing"}
        onSelect={(participantId) => (me ? onChip(participantId) : setPhase("pick"))}
        onAdd={(typed) => void addPerson(typed)}
      />
      {!me ? (
        <>
          <Text style={[type.secondary, styles.prompt, { color: c.muted }]}>{say.browse}</Text>
          <Button label={say.question} onPress={() => setPhase("pick")} outsideScroll />
        </>
      ) : creating && !memory.shared ? (
        <LinkLine url={splitUrl(splitId)} onShared={() => remember({ shared: true })} />
      ) : expanded && selectedPerson ? (
        <Breakdown
          split={split}
          person={selectedPerson}
          mine={selectedPerson.id === me}
          onPaid={(paid) => void act(paid ? { by: me, type: "recordPayment", participantId: me, amount: myShare } : { by: me, type: "clearPayment", participantId: me })}
        />
      ) : (
        <OweLine label={me === host.id ? say.yourShare : say.youOwe} amount={myShare} onPress={() => setExpanded(true)} />
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.field }]}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: sheetHeight + 16, paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }}
      >
        <View style={styles.column}>
          <SplitHeader onHistory={() => setOverlay({ kind: "history" })} onShare={() => void share()} />
          <View style={styles.doc}>
            <ReceiptCard
              split={split}
              shares={shares}
              selected={me ? selectedPerson : null}
              me={me}
              onCircle={(item) => void onCircle(item)}
              onOpen={(item) => setOverlay({ kind: "item", itemId: item.id })}
            />
          </View>
        </View>
      </ScrollView>
      <SpringSheet
        scrim={phase !== "regular"}
        label={phase === "pick" ? say.question : say.people}
        minHeight={phase === "pick" ? windowHeight - tallPickTop : 0}
        onHeight={setSheetHeight}
        onClose={phase === "pick" ? () => setPhase("regular") : undefined}
        stays
        extra={
          phase === "collapsing" ? (
            <PickSheet rows={pickRows(split, device)} intro={intro(split, creating)} chosen={chosen} leaving onPick={() => {}} onAdd={async () => null} onClose={() => {}} />
          ) : null
        }
        testID="split-sheet"
      >
        {phase === "pick" ? (
          <>
            <PickSheet rows={pickRows(split, device)} intro={intro(split, creating)} chosen={chosen} leaving={false} onPick={(pid, takeOver) => void choose(pid, takeOver)} onAdd={addYourself} onClose={() => setPhase("regular")} />
            {pickProblem ? <Text style={[type.small, styles.problem, { backgroundColor: c.flagWash, color: c.flag }]}>{pickProblem}</Text> : null}
          </>
        ) : (
          regular
        )}
      </SpringSheet>
      {overlay ? (
        <SpringSheet scrim label={overlay.kind === "item" ? say.item : say.history} onClose={overlayGone} closing={closing} testID={`${overlay.kind}-sheet`}>
          {overlay.kind === "item" ? (
            <ItemSheet
              split={split}
              itemId={overlay.itemId}
              me={me}
              send={act}
              onAddPerson={(typed, unit) =>
                void addPerson(typed).then((participantId) => participantId && act({ by: me, type: "claim", itemId: overlay.itemId, participantId, unit }))
              }
              onClose={closeOverlay}
            />
          ) : (
            <HistorySheet split={split} me={me} onRevert={(revision) => act({ by: me, type: "undo", revision })} onRestore={() => act({ by: me, type: "restoreReceipt" })} onClose={closeOverlay} />
          )}
        </SpringSheet>
      ) : null}
    </View>
  );
}

function pickRows(split: Split, device: string) {
  return split.participants.map((person) => {
    const pick = split.picks.find(({ participantId }) => participantId === person.id);
    return { person, picked: pick !== undefined && pick.device !== device };
  });
}

function intro(split: Split, creating: boolean) {
  const total = `$${plainAmount(split.receipt.total)}`;
  return creating ? { lead: say.linkReady, rest: ` ${total}` } : { lead: split.participants[0].name, rest: say.invited, strong: total };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480 },
  doc: { paddingTop: 6 },
  opening: { paddingTop: 24 },
  gone: { gap: 8, paddingTop: 24 },
  goneAction: { marginTop: 16 },
  regular: { gap: 14 },
  prompt: { marginHorizontal: 2 },
  problem: { alignSelf: "flex-start", marginTop: 10, marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
