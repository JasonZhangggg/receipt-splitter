import { useMemo } from "react";

import { people, personInks } from "./colors";
import { useScheme } from "./theme";

/** Each person's hue as the rest of the screen sees it. `flipped` gives the other scheme's tone, for a dot on an ink-filled chip. */
export function usePersonInks(ids: readonly string[]): (id: string, flipped?: boolean) => string {
  const scheme = useScheme();
  const key = ids.join("\u0000");
  return useMemo(() => {
    const own = personInks(scheme, ids);
    const other = personInks(scheme === "light" ? "dark" : "light", ids);
    return (id, flipped = false) => (flipped ? other : own).get(id) ?? people[0][scheme === "light" ? 0 : 1];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme, key]);
}
