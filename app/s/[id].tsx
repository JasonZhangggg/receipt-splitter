import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cents } from "../../src/core/money";
import type { Operation } from "../../src/core/operations";
import { pickDevice } from "../../src/core/pick-device";
import { computeShares } from "../../src/core/shares";
import { isRoutableSplitId, type DeviceId, type ItemId, type ParticipantId, type Split, type SplitId, type SplitItem } from "../../src/core/split";
import { forgetSplit, noteSplit, rememberSplit, splitOnDevice, thisDevice, type SplitOnDevice } from "../../src/device";
import { newName, plainAmount } from "../../src/draft";
import { newParticipantId, splitUrl, useLiveSplit, type GoneReason } from "../../src/live/client";
import { Button, type Press } from "../../src/ui/components/button";
import { Popover, useEscape } from "../../src/ui/components/popover";
import { Swap } from "../../src/ui/components/swap";
import { HistorySheet } from "../../src/ui/history";
import { joinCopy } from "../../src/ui/home-copy";
import { ItemSheet } from "../../src/ui/item-sheet";
import { AddItemSheet } from "../../src/ui/item-sheet/add";
import { PhotoViewer } from "../../src/ui/photo-viewer";
import { splitCopy as say } from "../../src/ui/split-copy";
import { Breakdown } from "../../src/ui/split-view/breakdown";
import { SplitHeader } from "../../src/ui/split-view/header";
import { OweLine } from "../../src/ui/split-view/owe-line";
import { barFor, circleTap, linesNear } from "../../src/ui/split-view/model";
import { PeopleChips } from "../../src/ui/split-view/people-chips";
import { PickSheet } from "../../src/ui/split-view/pick-sheet";
import { ReceiptCard } from "../../src/ui/split-view/receipt-card";
import { useLayoutHeight, useLayoutWidth } from "../../src/ui/components/viewport";
import { BottomSheet } from "../../src/ui/split-view/bottom-sheet";
import { webStyle } from "../../src/ui/motion";
import { breakpoints, layout, type, useColors } from "../../src/ui/theme";

export default function SplitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const splitId = isRoutableSplitId(id) ? id : null;
  const { live, send } = useLiveSplit(id);
  const expired = live.status === "gone" && live.reason === "notFound";
  useEffect(() => {
    if (expired && splitId) forgetSplit(splitId);
  }, [expired, splitId]);

  if (live.status === "live" && splitId) return <SplitPage key={splitId} splitId={splitId} split={live.split} photo={live.photo} send={send} />;
  return (
    <View style={[styles.screen, { backgroundColor: c.field, paddingTop: insets.top, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
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

type Phase = "pick" | "collapsing" | "regular";
type OverlayKind = { readonly kind: "item"; readonly itemId: ItemId; readonly lines: readonly ItemId[] } | { readonly kind: "add" } | { readonly kind: "history" };
/** What is open over the page and the press that opened it: the popover hangs from its trigger, and focus goes back there. */
type Overlay = OverlayKind & { readonly from: Press };
/** The right pane shows the pick content until this device has picked, then that person's share. */
type PaneView = "pick" | "share";
type Send = ReturnType<typeof useLiveSplit>["send"];

const overlayLabel = { item: say.item, add: say.newItem, history: say.history } as const;
const checkFor = 80;
const tallPickTop = 170;
const crossFadeFor = 200;

function SplitPage({ splitId, split, photo, send }: { splitId: SplitId; split: Split; photo: boolean; send: Send }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const pageHeight = useLayoutHeight();
  const wide = useLayoutWidth() >= breakpoints.pairFrom;
  const paneRef = useRef<View>(null);
  const device = useMemo(() => pickDevice(thisDevice(), splitId), [splitId]);
  const [memory, setMemory] = useState<SplitOnDevice>(() => splitOnDevice(splitId));
  const remember = (change: Parameters<typeof rememberSplit>[1]) => {
    rememberSplit(splitId, change);
    setMemory(splitOnDevice(splitId));
  };
  const held = split.picks.find((pick) => pick.participantId === memory.me);
  const me = memory.me && held?.device === device ? memory.me : null;
  const [phase, setPhase] = useState<Phase>(me ? "regular" : "pick");
  const [chosen, setChosen] = useState<ParticipantId | null>(null);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [payProblem, setPayProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<ParticipantId | null>(me);
  const [expanded, setExpanded] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [closing, setClosing] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [viewing, setViewing] = useState(false);
  const photoUrl = `/api/splits/${splitId}/photo`;
  useEffect(() => {
    if (photo) Image.prefetch(photoUrl).catch(() => {});
  }, [photo, photoUrl]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => noteSplit(split), [split]);

  const shares = useMemo(() => computeShares(split), [split]);
  const people = split.participants;
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
      }, checkFor + crossFadeFor),
    );
  };

  const addPerson = async (typed: string): Promise<{ readonly id: ParticipantId } | { readonly refused: string }> => {
    const named = newName(typed, people.map(({ name }) => name));
    if (!named.ok) return { refused: named.reason === "nameTaken" ? say.nameTaken : say.nameNeeded };
    const participant = { id: newParticipantId(), name: named.name };
    return (await act({ by: me, type: "addParticipant", participant })) ? { id: participant.id } : { refused: say.nameRefused };
  };

  const addYourself = async (typed: string) => {
    const added = await addPerson(typed);
    if ("refused" in added) return added.refused;
    await choose(added.id, false);
    return null;
  };

  const onCircle = async (item: SplitItem) => {
    if (wide && !me) return (paneRef.current as unknown as HTMLElement | null)?.querySelector<HTMLElement>("[role='list'] [data-pressable]")?.focus();
    if (!me || !selectedPerson) return setPhase("pick");
    for (const op of circleTap(item, selectedPerson.id)) await act({ ...op, by: me });
  };

  const collapse = () => {
    setExpanded(false);
    setSelected(me);
  };

  const onChip = (participantId: ParticipantId) => {
    if (participantId === selected && expanded) return collapse();
    setSelected(participantId);
    setExpanded(true);
  };

  const share = async () => {
    const url = splitUrl(splitId);
    if (typeof navigator.share === "function") await navigator.share({ url }).catch(() => {});
    else await navigator.clipboard?.writeText(url).catch(() => {});
  };

  const markPaid = async (payer: ParticipantId, paid: boolean) => {
    setPayProblem(null);
    const answer = await send(paid ? { by: payer, type: "recordPayment", participantId: payer, device, amount: myShare } : { by: payer, type: "clearPayment", participantId: payer, device });
    if (!answer.ok) setPayProblem(answer.rejection.reason === "payerOnly" ? say.payerOnly : say.saveFailed);
  };

  const open = (kind: OverlayKind, from: Press) => setOverlay({ ...kind, from });
  const closeOverlay = () => setClosing(true);
  const overlayGone = () => {
    setOverlay(null);
    setClosing(false);
    if (!overlay || !(wide || overlay.from.keyboard)) return;
    const trigger = overlay.from.trigger.isConnected ? overlay.from.trigger : overlay.kind === "item" ? nearestLine(overlay.lines, overlay.itemId) : null;
    trigger?.focus({ preventScroll: true });
  };
  useEscape(overlay !== null && !closing && !wide, closeOverlay);

  const myShare = shares.shares.find((row) => row.participantId === me)?.share ?? cents(0);
  const chips = (
    <View style={styles.chips}>
      <PeopleChips
        people={people}
        picked={picked}
        me={me}
        selected={me ? (selectedPerson?.id ?? null) : null}
        entering={phase === "collapsing"}
        onSelect={(participantId) => (me ? onChip(participantId) : setPhase("pick"))}
        onAdd={(typed) => void addPerson(typed)}
      />
    </View>
  );
  const pickContent = (
    <>
      <PickSheet
        rows={pickRows(split, device)}
        intro={intro(split, creating)}
        chosen={chosen}
        onPick={(pid, takeOver) => void choose(pid, takeOver)}
        onAdd={addYourself}
        onClose={wide ? undefined : () => setPhase("regular")}
        url={splitUrl(splitId)}
      />
      {pickProblem ? <Text style={[type.small, styles.problem, { color: c.muted }]}>{pickProblem}</Text> : null}
    </>
  );
  const paneView: PaneView = me && phase !== "pick" ? "share" : "pick";
  const pane = (
    <View ref={paneRef} role="complementary" aria-label={say.people} style={[styles.pane, sticky, { maxHeight: pageHeight - 2 * paneInset, backgroundColor: c.sheet, boxShadow: c.panelShadow }]}>
      <ScrollView style={contain} contentContainerStyle={styles.paneContent}>
        <Swap view={paneView}>
          {paneView === "share" && me && selectedPerson ? (
            <View>
              <View style={styles.chips}>
                <PeopleChips
                  people={people}
                  picked={picked}
                  me={me}
                  selected={selectedPerson.id}
                  onSelect={(participantId) => setSelected(participantId === selectedPerson.id ? me : participantId)}
                  onAdd={(typed) => void addPerson(typed)}
                />
              </View>
              <Swap view={selectedPerson.id}>
                <Breakdown split={split} person={selectedPerson} viewer={me} onPaid={(paid) => void markPaid(me, paid)} />
                {payProblem && selectedPerson.id === me ? <Text style={[type.small, styles.problem, { color: c.muted }]}>{payProblem}</Text> : null}
              </Swap>
            </View>
          ) : (
            pickContent
          )}
        </Swap>
      </ScrollView>
    </View>
  );
  const overlayContent = overlay ? (
    overlay.kind === "item" ? (
      <ItemSheet
        split={split}
        itemId={overlay.itemId}
        me={me}
        send={act}
        onAddPerson={(typed) => void addPerson(typed).then((added) => "id" in added && act({ by: me, type: "claim", itemId: overlay.itemId, participantId: added.id }))}
        onClose={closeOverlay}
      />
    ) : overlay.kind === "add" ? (
      <AddItemSheet split={split} me={me} send={send} onClose={closeOverlay} />
    ) : (
      <HistorySheet split={split} me={me} onRevert={(revision) => act({ by: me, type: "undo", revision })} onRestore={() => act({ by: me, type: "restoreReceipt" })} onClose={closeOverlay} />
    )
  ) : null;

  const bar = barFor(me, expanded, selectedPerson?.id ?? null);
  const shown = bar.kind === "breakdown" ? people.find(({ id }) => id === bar.person) : undefined;
  const regular = (
    <View style={styles.regular}>
      {bar.kind === "ask" ? (
        <>
          <Text style={[type.secondary, styles.prompt, { color: c.muted }]}>{say.browse}</Text>
          <Button label={say.question} onPress={() => setPhase("pick")} outsideScroll />
        </>
      ) : bar.kind === "share" ? (
        <OweLine label={say.yourShare} amount={myShare} onPress={() => setExpanded(true)} />
      ) : shown ? (
        <View>
          <Breakdown split={split} person={shown} viewer={bar.me} onPaid={(paid) => void markPaid(bar.me, paid)} />
          {payProblem && shown.id === bar.me ?<Text style={[type.small, styles.problem, { color: c.muted }]}>{payProblem}</Text> : null}
        </View>
      ) : null}
    </View>
  );

  const showingNow = closing ? null : overlay;
  const receipt = (
    <ReceiptCard
      split={split}
      shares={shares}
      selected={me ? selectedPerson : null}
      me={me}
      onCircle={(item) => void onCircle(item)}
      onOpen={(item, from) => open({ kind: "item", itemId: item.id, lines: split.receipt.items.map(({ id }) => id) }, from)}
      onAdd={(from) => open({ kind: "add" }, from)}
      showing={showingNow?.kind === "item" ? showingNow.itemId : showingNow?.kind === "add" ? "add" : null}
    />
  );
  const header = <SplitHeader onReceipt={photo ? () => setViewing(true) : undefined} onHistory={(from) => open({ kind: "history" }, from)} historyOpen={showingNow?.kind === "history"} onShare={() => void share()} />;

  return (
    <View style={[styles.screen, { backgroundColor: c.field }]}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: wide ? 48 : sheetHeight + 16, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }}
      >
        {wide ? (
          <View style={styles.wrap}>
            {header}
            <View style={styles.pair}>
              <View style={styles.receiptColumn}>{receipt}</View>
              {pane}
            </View>
          </View>
        ) : (
          <View style={styles.column}>
            {header}
            <View style={styles.doc}>{receipt}</View>
          </View>
        )}
      </ScrollView>
      {wide ? null : (
        <BottomSheet
          scrim={phase === "pick"}
          label={phase === "pick" ? say.question : say.people}
          minHeight={phase === "pick" ? pageHeight - tallPickTop : 0}
          rises={false}
          lowered={overlay !== null && !closing}
          onHeight={setSheetHeight}
          onDown={phase === "pick" ? () => setPhase("regular") : bar.kind === "breakdown" ? collapse : undefined}
          onUp={phase === "regular" && bar.kind === "share" ? () => setExpanded(true) : undefined}
          stays
          view={phase === "pick" ? "pick" : bar.kind === "breakdown" ? `breakdown-${bar.person}` : bar.kind}
          header={phase === "pick" ? null : chips}
          testID="split-sheet"
        >
          {phase === "pick" ? pickContent : regular}
        </BottomSheet>
      )}
      {overlay && wide ? (
        <Popover anchor={overlay.from.trigger} label={overlayLabel[overlay.kind]} instant={overlay.from.keyboard} closing={closing} onClose={closeOverlay} onGone={overlayGone}>
          {overlayContent}
        </Popover>
      ) : overlay ? (
        <BottomSheet scrim label={overlayLabel[overlay.kind]} onDown={overlayGone} closing={closing} testID={`${overlay.kind}-sheet`}>
          {overlayContent}
        </BottomSheet>
      ) : null}
      {viewing && photo ? <PhotoViewer photo={{ uri: photoUrl, name: say.receiptPhoto }} onExited={() => setViewing(false)} /> : null}
    </View>
  );
}

function pickRows(split: Split, device: DeviceId) {
  return split.participants.map((person) => {
    const pick = split.picks.find(({ participantId }) => participantId === person.id);
    return { person, picked: pick !== undefined && pick.device !== device };
  });
}

function intro(split: Split, creating: boolean) {
  const total = `$${plainAmount(split.receipt.total)}`;
  return creating ? { lead: say.linkReady, rest: ` ${total}` } : { lead: split.participants[0].name, rest: say.invited, strong: total };
}

const paneInset = 16;
// The pane holds still while the receipt scrolls, so Your share stays in view.
const sticky = webStyle({ position: "sticky", top: `${paneInset}px` });
const contain = webStyle({ overscrollBehavior: "contain" });

/** After Split or Delete item the line is gone; focus goes to the nearest line still on screen. */
function nearestLine(lines: readonly ItemId[], gone: ItemId): HTMLElement | null {
  for (const id of linesNear(lines, gone)) {
    const open = [...document.querySelectorAll<HTMLElement>(`[data-testid="line-${id}"] [data-pressable]`)].at(-1);
    if (open && open.getClientRects().length > 0 && open.offsetHeight > 0) return open;
  }
  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: "hidden", ...webStyle({ overflow: "clip" }) },
  page: { flex: 1 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480 },
  // Receipt 624, gap 40 and pane 400, from round 3's desktop frames. The receipt gives up width first.
  wrap: { alignSelf: "center", width: "100%", maxWidth: 1064 },
  pair: { flexDirection: "row", alignItems: "flex-start", gap: 40, paddingTop: 6 },
  receiptColumn: { flex: 1, minWidth: 0 },
  pane: { width: 400, borderRadius: 24, overflow: "hidden" },
  paneContent: { padding: 20 },
  doc: { paddingTop: 6 },
  opening: { paddingTop: 24 },
  gone: { gap: 8, paddingTop: 24 },
  goneAction: { marginTop: 16 },
  regular: { gap: layout.blockGap },
  chips: { marginBottom: layout.blockGap },
  prompt: { marginHorizontal: 2 },
  problem: { alignSelf: "flex-start", marginTop: 10, marginHorizontal: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
