import { StyleSheet, Text, View } from "react-native";

import type { ParticipantId } from "../../core/split";
import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { linkPress } from "../components/text-link";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { motion, tabular, type, useColors } from "../theme";
import { itemFilters, type ItemFilter } from "./model";

export const filterMenuWidth = 236;

/** Every place a filter shows reads from this, so the tabs, the button and the menu name it alike. `whose` is the viewed person's first name, or null for the viewer. */
export function filterLabel(filter: ItemFilter, whose: string | null): string {
  return filter === "mine" ? say.filterMine(whose) : say.filters[filter];
}

type Props = {
  filter: ItemFilter;
  counts: Record<ItemFilter, number>;
  viewer: ParticipantId | null;
  whose: string | null;
};

/** The wide layout's filters over the list: text tabs with their counts, the current one in ink over a short rule. */
export function FilterTabs({ filter, counts, viewer, whose, onPick }: Props & { onPick: (filter: ItemFilter) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={styles.tabs}>
      {itemFilters(viewer).map((one) => {
        const on = one === filter;
        const label = filterLabel(one, whose);
        return (
          <PressTarget key={one} name={`${label}, ${counts[one]}`} toggled={on} onPress={() => onPick(one)} style={(pressed) => [styles.tab, pressStyle(pressed, reduce, linkPress)]}>
            {(_, hovered) => (
              <View style={styles.tabFace}>
                <Text numberOfLines={1} style={[type.body, tabular, inkFade, { color: on || hovered ? c.ink : c.muted }]}>
                  {`${label} `}
                  <Text style={{ color: c.muted }}>{counts[one]}</Text>
                </Text>
                <View style={[styles.rule, { backgroundColor: on ? c.ink : "transparent" }]} />
              </View>
            )}
          </PressTarget>
        );
      })}
    </View>
  );
}

/** The phone's filter control, at the Items line's end: "Show all 10", or the picked filter and its count, opening the filter menu. */
export function FilterButton({ filter, counts, whose, open, onOpen }: Omit<Props, "viewer"> & { open: boolean; onOpen: (press: Press) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const label = filter === "all" ? say.showAll(counts.all) : `${filterLabel(filter, whose)} ${counts[filter]}`;
  return (
    <PressTarget name={`${say.showItems}: ${label}`} popup="dialog" expanded={open} onPress={onOpen} style={(pressed) => [styles.button, pressStyle(pressed, reduce, linkPress)]}>
      {() => (
        <View testID="filter-button" style={styles.buttonFace}>
          <Text numberOfLines={1} style={[type.caption, tabular, { color: c.ink }]}>
            {label}
          </Text>
          <View style={[{ transform: [{ rotate: open ? "180deg" : "0deg" }] }, !reduce && turn]}>
            <Icon name="chevron" size={14} color={c.muted} />
          </View>
        </View>
      )}
    </PressTarget>
  );
}

/** The phone's filter menu: each filter with its count, a tick on the current one. */
export function FilterMenu({ filter, counts, viewer, whose, onPick }: Props & { onPick: (filter: ItemFilter) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View>
      {itemFilters(viewer).map((one) => {
        const on = one === filter;
        const label = filterLabel(one, whose);
        return (
          <PressTarget key={one} name={`${label}, ${counts[one]}`} toggled={on} outsideScroll onPress={() => onPick(one)} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
            {(pressed) => (
              <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
                <View style={styles.tick}>{on ? <Icon name="chosen" size={14} color={c.ink} /> : null}</View>
                <Text numberOfLines={1} style={[type.body, styles.label, { color: c.ink }]}>
                  {label}
                </Text>
                <Text style={[type.body, tabular, { color: c.muted }]}>{counts[one]}</Text>
              </View>
            )}
          </PressTarget>
        );
      })}
    </View>
  );
}

const inkFade = webStyle({
  transitionProperty: "color",
  transitionDuration: "150ms",
  transitionTimingFunction: "ease",
});
/** The chevron turns over with the menu it opens, at the menu's own 200 ms, as the share head's does. */
const turn = webStyle({
  transitionProperty: "transform",
  transitionDuration: `${motion.controlIn}ms`,
  transitionTimingFunction: motion.easeOut,
});

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 24,
    flexShrink: 1,
    minWidth: 0,
  },
  tab: { minHeight: 44, justifyContent: "flex-end" },
  tabFace: { paddingTop: 10 },
  rule: { height: 1.5, marginTop: 8 },
  button: { minHeight: 44, justifyContent: "center", flexShrink: 0 },
  buttonFace: { flexDirection: "row", alignItems: "center", gap: 6 },
  press: { alignSelf: "stretch" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  tick: { width: 14 },
  label: { flex: 1 },
});
