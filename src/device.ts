import { isId, type ParticipantId, type SplitId } from "./core/split";

export type SplitOnDevice = { readonly creatorSecret?: string; readonly me?: ParticipantId };

type Store = Pick<Storage, "getItem" | "setItem">;

const keyOf = (id: SplitId) => `receipt-splitter:split:${id}`;

export function splitOnDevice(id: SplitId, storage: Store | undefined = globalThis.localStorage): SplitOnDevice {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(keyOf(id)) ?? "null");
    if (typeof saved !== "object" || saved === null) return {};
    const { creatorSecret, me } = saved as Record<string, unknown>;
    return {
      ...(typeof creatorSecret === "string" ? { creatorSecret } : {}),
      ...(isId<"ParticipantId">(me) ? { me } : {}),
    };
  } catch {
    return {};
  }
}

export function rememberSplit(id: SplitId, change: { creatorSecret?: string; me?: ParticipantId | null }, storage: Store | undefined = globalThis.localStorage) {
  const { me, ...rest } = { ...splitOnDevice(id, storage), ...change };
  try {
    storage?.setItem(keyOf(id), JSON.stringify(me === null ? rest : { ...rest, me }));
  } catch {
    return;
  }
}
