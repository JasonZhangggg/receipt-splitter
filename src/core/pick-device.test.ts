import { describe, expect, test } from "vitest";
import { pickDevice } from "./pick-device";
import { deviceId, type SplitId } from "./split";

const browser = deviceId("AbCdEfGh01234567");
const one = "legacySplitId000000000" as SplitId;
const other = "otherSplitId0000000000" as SplitId;

describe("pickDevice", () => {
  test("turns a browser's device id into a 22-character id that differs per Split and repeats within one", () => {
    expect([pickDevice(browser, one), pickDevice(browser, other), pickDevice(browser, one)]).toEqual([
      "-XjjmAiCzMX4N0bydfUYrl",
      "SFExni7iPmtOp_hxDrXRFL",
      "-XjjmAiCzMX4N0bydfUYrl",
    ]);
  });

  test("leaves an id that is already per Split as it is, so hashing twice changes nothing", () => {
    expect(pickDevice(pickDevice(browser, one), one)).toBe("-XjjmAiCzMX4N0bydfUYrl");
  });
});
