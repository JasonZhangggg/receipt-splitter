import { expect, test } from "vitest";

import type { Split } from "../core/split";
import { firstSight, forgetFirstSight, keepCreated } from "./first-sight";

const id = "abcdefghjkmnpqrstuvwxy";
const split = { id, revision: 0, participants: [] } as unknown as Split;

test("a Split just created is what the Host's page shows first, until the server's state replaces it", () => {
  expect(firstSight(id)).toBeNull();
  keepCreated(split);
  expect(firstSight(id)).toEqual({ split, photo: false });
  forgetFirstSight(id);
  expect(firstSight(id)).toBeNull();
});
