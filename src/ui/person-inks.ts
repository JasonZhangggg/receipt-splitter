import { useMemo } from "react";

import { people, personInks, type PersonInk } from "./colors";
import { useScheme } from "./theme";

/** Each person's pastel `fill` and deeper `mark` as the rest of the screen sees it. */
export function usePersonInks(ids: readonly string[]): (id: string) => PersonInk {
  const scheme = useScheme();
  const key = ids.join("\u0000");
  return useMemo(() => {
    const own = personInks(scheme, ids);
    return (id) => own.get(id) ?? people[0][scheme];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme, key]);
}
