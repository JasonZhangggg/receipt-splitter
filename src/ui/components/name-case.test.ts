import { expect, test } from "vitest";

import { withCapital } from "./name-case";

test("capitalizes the first letter of a name and leaves the rest as typed", () => {
  expect(withCapital("jason")).toBe("Jason");
  expect(withCapital("de la Cruz")).toBe("De la Cruz");
  expect(withCapital("Mia")).toBe("Mia");
  expect(withCapital("élodie")).toBe("Élodie");
  expect(withCapital("")).toBe("");
  expect(withCapital(" sam")).toBe(" sam");
});
