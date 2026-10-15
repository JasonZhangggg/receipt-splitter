import type { DeviceId, ParticipantId, Split } from "../../core/split";

/** Who holds this device's remembered name: this device, or another one. Absent when the name has no pick. */
export type Hold = { readonly name: ParticipantId; readonly by: "here" | "elsewhere" } | null;

export function holdOf(split: Split, name: ParticipantId | undefined, device: DeviceId): Hold {
  const held = name === undefined ? undefined : split.picks.find((pick) => pick.participantId === name);
  return name !== undefined && held ? { name, by: held.device === device ? "here" : "elsewhere" } : null;
}

/** The name another device just took from this one. A name that was given up, removed or reset never moves here. */
export function takenName(before: Hold, after: Hold): ParticipantId | null {
  return before?.by === "here" && after?.by === "elsewhere" && before.name === after.name ? after.name : null;
}
