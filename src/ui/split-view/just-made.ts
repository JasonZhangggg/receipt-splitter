let made: string | null = null;

/** Create link marks the Split it is about to open, so that page greets the Host with Link ready once. A reload or a later visit finds nothing. */
export const markJustMade = (splitId: string) => {
  made = splitId;
};

/** True the first time the Split just made asks, and never again. */
export const takeJustMade = (splitId: string) => {
  if (made !== splitId) return false;
  made = null;
  return true;
};
