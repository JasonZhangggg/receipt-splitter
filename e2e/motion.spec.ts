import { addLatency, judge, record, scenarios } from "./motion";
import { expect, test } from "./without-ocr";

test.setTimeout(60_000);

// The fast subset; .claude/skills/verify-receipt-splitter/motion.mjs runs every scenario on three lanes at 1x and 4x.
const fast = ["pick-handoff", "open-tap", "collapse-tap", "collapse-flick", "bundle-expand", "item-open", "reduced-open-tap", "reduced-collapse-drag"];

for (const scenario of scenarios.filter(({ id }) => fast.includes(id))) {
  test(`${scenario.name}: no long frame, no jump, no reversal`, { tag: "@frame-timing" }, async ({ page }) => {
    if (scenario.latencyMs) await addLatency(page, scenario.latencyMs);
    await scenario.setup(page);
    const trace = await record(page, scenario.probes, () => scenario.act(page), { quietMs: scenario.quietMs });
    expect(judge(trace, scenario.probes, { instant: scenario.instant }).failures).toEqual([]);
  });
}
