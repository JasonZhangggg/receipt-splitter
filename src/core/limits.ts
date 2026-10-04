import { SPLIT_BYTE_BUDGET } from "./split";

export const MAX_ITEMS = 100;
export const MAX_ADJUSTMENTS = 20;
export const MAX_PARTICIPANTS = 30;
export const MAX_PARTICIPANT_NAME_LENGTH = 40;
export const MAX_ROW_NAME_LENGTH = 80;
export const MAX_DETAIL_LENGTH = 120;
export const MAX_QUANTITY = 20;
export const MAX_SHARES = 99;
export const RECENT_CHANGES_LIMIT = 64;
/** An old Split's line of up to MAX_QUANTITY units can read as that many rows, so a stored Split may hold more Items than a write may add. */
export const MAX_STORED_ITEMS = MAX_ITEMS * MAX_QUANTITY;
export const MAX_STORED_BYTES = MAX_QUANTITY * SPLIT_BYTE_BUDGET;
export const MAX_WRITES_PER_CHANGE = MAX_ITEMS + MAX_ADJUSTMENTS + 1;
/** An old change reads with one perUnit mark added, so a stored change may hold one write more than a new one. */
export const MAX_STORED_WRITES_PER_CHANGE = MAX_WRITES_PER_CHANGE + 1;
export const PAYMENT_RESERVE_BYTES = 2 * 1024;
export const MAX_CHANGE_BYTES = 5 * 1024;
/** Bytes of recorded changes a Split may write in one burst before the Worker's history rate refuses more. */
export const HISTORY_BURST_BYTES = MAX_CHANGE_BYTES;
const COMMAS_BETWEEN_CHANGES = RECENT_CHANGES_LIMIT;
export const HISTORY_RESERVE_BYTES = MAX_CHANGE_BYTES + HISTORY_BURST_BYTES + COMMAS_BETWEEN_CHANGES;
