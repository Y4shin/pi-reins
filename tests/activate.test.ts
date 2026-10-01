/**
 * The activation flow: `/reins-activate` previews the attached plan,
 * requires explicit confirmation, and on confirm flips the plan from
 * proposed to active. Driven through the command boundary of the
 * shared harness, with scripted dialog answers and captured UI calls.
 *
 * Activation is user-controlled: the model can neither trigger it nor
 * bypass the confirmation. Declining changes nothing durable.
 */

import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";

import { createHarness, type ReinsHarness } from "./harness/index.js";

const harnesses: ReinsHarness[] = [];

function makeHarness(options: Parameters<typeof createHarness>[0]): ReinsHarness {
  const h = createHarness(options);
  harnesses.push(h);
  return h;
}

afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

const FIXED_NOW = () => "2026-10-01T12:00:00.000Z";

/** Parse the frontmatter mapping of a plan-directory document. */
function frontmatterOf(text: string): Record<string, unknown> {
  return YAML.parse(text.split("---\n")[1]) as Record<string, unknown>;
}

describe("activation log record", () => {
  test("confirming appends the Activation entry newest-first without duplicating Creation", async () => {
    const h = makeHarness({
      planDir: "plan-valid",
      now: FIXED_NOW,
      uiScript: { confirm: true },
    });
    await h.runCommand("reins-attach", "plan");

    await h.runCommand("reins-activate");

    const log = h.readPlanFile("log.md");
    expect(log).toContain("## 2026-10-01");
    expect(log).toContain("* **Activation**: Plan activated by the user; execution begins.");
    // The planner's Creation entry is kept, never duplicated.
    expect(log.split("**Creation**").length - 1).toBe(1);
    // Newest first: the activation date group precedes the existing one.
    expect(log.indexOf("## 2026-10-01")).toBeLessThan(log.indexOf("## 2026-09-01"));
  });
  test("a log without a Creation entry gains one; Activation lands above it", async () => {
    const h = makeHarness({
      planDir: "plan-valid",
      now: FIXED_NOW,
      uiScript: { confirm: true },
    });
    await h.runCommand("reins-attach", "plan");
    // An external planner may deliver a log without a Creation entry.
    h.writePlanFile("log.md", "# Plan Update Log\n");

    await h.runCommand("reins-activate");

    const log = h.readPlanFile("log.md");
    expect(log).toContain("* **Activation**: Plan activated by the user; execution begins.");
    expect(log).toContain("* **Creation**:");
    // Both entries land under the activation date, Activation newest-first.
    const group = log.slice(log.indexOf("## 2026-10-01"));
    expect(group.indexOf("**Activation**")).toBeLessThan(group.indexOf("**Creation**"));
  });
  test("confirming appends the first verified event with a human actor", async () => {
    const h = makeHarness({
      planDir: "plan-valid",
      now: FIXED_NOW,
      uiScript: { confirm: true },
    });
    await h.runCommand("reins-attach", "plan");

    await h.runCommand("reins-activate");

    const plan = frontmatterOf(h.readPlanFile("plan.md"));
    const verified = plan.verified as Array<{ by: string; at: string }>;
    expect(verified).toHaveLength(1);
    expect(verified[0].by).toBe("human:harness-test-user");
    expect(verified[0].at).toBe("2026-10-01T12:00:00.000Z");
  });
});

describe("activation widget", () => {
  test("the widget renders goal and counts after activation and nothing before", async () => {
    const h = makeHarness({
      planDir: "plan-valid",
      now: FIXED_NOW,
      uiScript: { confirm: true },
    });
    await h.runCommand("reins-attach", "plan");
    // Nothing is rendered for a merely attached (proposed) plan.
    expect(h.ui.widgets).toEqual([]);

    await h.runCommand("reins-activate");

    expect(h.ui.widgets).toHaveLength(1);
    expect(h.ui.widgets[0].key).toBe("pi-reins");
    const rendered = (h.ui.widgets[0].lines ?? []).join("\n");
    expect(rendered).toContain("Migrate configuration loading to the new provider model");
    expect(rendered).toContain("0/3");
  });
});

describe("reins-activate without UI", () => {
  test("activation without an interactive UI blocks fail-closed instead of auto-approving", async () => {
    const h = makeHarness({ planDir: "plan-valid", now: FIXED_NOW, hasUI: false });
    await h.runCommand("reins-attach", "plan");
    const planBefore = h.readPlanFile("plan.md");
    const logBefore = h.readPlanFile("log.md");

    await h.runCommand("reins-activate");

    // No dialog was shown and nothing was auto-approved.
    expect(h.ui.dialogs).toEqual([]);
    // One clear refusal: the attach report plus the fail-closed error.
    expect(h.ui.notifies).toHaveLength(2);
    expect(h.ui.notifies[1].type).toBe("error");
    expect(h.ui.notifies[1].message).toContain("interactive UI");
    // Nothing durable changed and nothing was rendered.
    expect(h.readPlanFile("plan.md")).toBe(planBefore);
    expect(h.readPlanFile("log.md")).toBe(logBefore);
    expect(h.session.entries).toEqual([
      { customType: "reins-attached", data: { planDir: h.planDir, phase: "attached" } },
    ]);
    expect(h.ui.widgets).toEqual([]);
  });
});

describe("reins-activate refusals", () => {
  test("activating with nothing attached is refused", async () => {
    const h = makeHarness({ now: FIXED_NOW });

    await h.runCommand("reins-activate");

    expect(h.ui.notifies).toHaveLength(1);
    expect(h.ui.notifies[0].type).toBe("error");
    expect(h.ui.notifies[0].message).toContain("no contract is attached");
    // Refusal never reaches a dialog: there is nothing to preview.
    expect(h.ui.dialogs).toEqual([]);
    expect(h.session.entries).toEqual([]);
  });

  test("activating an already-active contract is refused", async () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });

    await h.runCommand("reins-attach", "plan");
    await h.runCommand("reins-activate");

    expect(h.ui.notifies).toHaveLength(2);
    expect(h.ui.notifies[1].type).toBe("error");
    expect(h.ui.notifies[1].message).toContain("already active");
    expect(h.ui.dialogs).toEqual([]);
    // Only the attach entry: the refusal records nothing.
    expect(h.session.entries).toEqual([
      { customType: "reins-attached", data: { planDir: h.planDir, phase: "executing" } },
    ]);
  });
});

describe("reins-activate preview and confirmation", () => {
  test("the command previews goal and tasks, and declining changes nothing durable", async () => {
    const h = makeHarness({
      planDir: "plan-valid",
      now: FIXED_NOW,
      uiScript: { confirm: false },
    });
    await h.runCommand("reins-attach", "plan");
    const planBefore = h.readPlanFile("plan.md");
    const logBefore = h.readPlanFile("log.md");

    await h.runCommand("reins-activate");

    // The preview: one confirmation dialog carrying the goal and the
    // task summary, so the user understands what is about to run.
    expect(h.ui.dialogs).toHaveLength(1);
    expect(h.ui.dialogs[0].kind).toBe("confirm");
    const preview = h.ui.dialogs[0].message ?? "";
    expect(preview).toContain("Migrate configuration loading to the new provider model");
    expect(preview).toContain("Inspect the current system");
    expect(preview).toContain("Implement the provider-based loader");
    expect(preview).toContain("Verify the result");

    // Declining: no durable change anywhere.
    expect(h.readPlanFile("plan.md")).toBe(planBefore);
    expect(h.readPlanFile("log.md")).toBe(logBefore);
    expect(h.session.entries).toEqual([
      { customType: "reins-attached", data: { planDir: h.planDir, phase: "attached" } },
    ]);
    expect(h.ui.widgets).toEqual([]);
    expect(h.ui.notifies).toHaveLength(2);
    expect(h.ui.notifies[1].type).toBe("info");
    expect(h.ui.notifies[1].message).toContain("declined");
  });

  test("on confirm the plan flips to active and the plugin enters executing", async () => {
    const h = makeHarness({
      planDir: "plan-valid",
      now: FIXED_NOW,
      uiScript: { confirm: true },
    });
    await h.runCommand("reins-attach", "plan");

    await h.runCommand("reins-activate");

    const plan = frontmatterOf(h.readPlanFile("plan.md"));
    expect(plan.executionStatus).toBe("active");
    expect(h.session.entries).toEqual([
      { customType: "reins-attached", data: { planDir: h.planDir, phase: "attached" } },
      { customType: "reins-activated", data: { planDir: h.planDir, phase: "executing" } },
    ]);
    expect(h.ui.notifies[1].type).toBe("info");
    expect(h.ui.notifies[1].message).toContain("Migrate configuration loading to the new provider model");
  });
});
