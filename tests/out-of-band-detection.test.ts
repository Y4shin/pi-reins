/**
 * Out-of-band plan change detection and reconciliation, driven through
 * the event-handler and tool boundaries of the shared harness.
 *
 * At every turn boundary the contract fingerprint is compared against
 * the last armed baseline; a change the plugin did not mediate (a hand
 * edit between runs) is detected at the next boundary. The reaction
 * notifies the user, queues a forced steering message for the model,
 * and enters reconciling: task mutations are refused and raw writes
 * into the plan directory stay blocked until the user reconciles.
 * Turn-end drift the plugin itself wrote (observed plugin writes) is
 * absorbed silently, never treated as out-of-band.
 */

import { afterEach, describe, expect, test } from "vitest";

import { createDriftMonitor, type DriftMonitor } from "../src/handlers/drift.js";
import type { ReinsState } from "../src/state.js";
import { createHarness, type ReinsHarness } from "./harness/index.js";

const harnesses: ReinsHarness[] = [];

function makeHarness(options: Parameters<typeof createHarness>[0]): ReinsHarness {
  const h = createHarness(options);
  harnesses.push(h);
  return h;
}

afterEach(async () => {
  for (const h of harnesses.splice(0)) {
    // The session-start-scoped watcher is torn down with the session.
    await h.fire("session_shutdown");
    h.dispose();
  }
});

const FIXED_NOW = () => "2026-10-01T12:00:00.000Z";

/** A harness attached to the active fixture: the contract is executing. */
async function executingHarness(options: Parameters<typeof createHarness>[0] = {}) {
  const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW, ...options });
  await h.runCommand("reins-attach", "plan");
  return h;
}

/** A contract-significant hand edit: rewriting a task's Description section. */
function handEdit(h: ReinsHarness): void {
  h.writePlanFile(
    "100-inspect-current-system.md",
    h
      .readPlanFile("100-inspect-current-system.md")
      .replace("Map how configuration is loaded today", "Map only the entry points today"),
  );
}

const LAST_WIDGET = (h: ReinsHarness): string =>
  (h.ui.widgets[h.ui.widgets.length - 1].lines ?? []).join("\n");

describe("hand edits between runs are detected at the next boundary", () => {
  test("a hand edit between turns is detected at the next turn boundary and reconciled on accept", async () => {
    const h = await executingHarness({ uiScript: { confirm: true } });
    // A full run passes with no edits: no reaction anywhere.
    await h.fire("turn_start");
    await h.fire("turn_end");
    expect(h.ui.dialogs).toEqual([]);

    // The hand edit lands between runs...
    handEdit(h);
    // ...and the next run's first boundary detects it.
    await h.fire("turn_start");

    // The user is notified, naming the changed file.
    const warning = h.ui.notifies.find((n) => n.type === "warning" && n.message.includes("out-of-band"));
    expect(warning?.message).toContain("100-inspect-current-system.md");
    // The model receives a forced steering message naming the change.
    const forced = h.steering.forced.find((trigger) => trigger.reason === "out-of-band");
    expect(forced?.note).toContain("100-inspect-current-system.md");
    // The reconciliation gate opened and was shown to the user.
    expect(h.ui.dialogs.some((d) => d.kind === "confirm" && (d.message ?? "").includes("100-inspect-current-system.md"))).toBe(true);
    expect(LAST_WIDGET(h)).toContain("Gate: executing");

    // Reconciled: a following boundary stays quiet (no duplicate alarm).
    await h.fire("turn_start");
    expect(h.ui.dialogs).toHaveLength(1);
    // And the contract still executes: the task tools answer.
    const status = await h.dispatchTool("reins_status");
    expect(status.isError).toBe(false);
  });

  test("a hand edit during a turn is caught by the turn-end drift verification", async () => {
    const h = await executingHarness({ uiScript: { confirm: true } });
    await h.fire("turn_start");

    handEdit(h);
    await h.fire("turn_end");

    expect(h.ui.dialogs).toHaveLength(1);
    expect(LAST_WIDGET(h)).toContain("Gate: executing");
  });

  test("plugin task writes never read as out-of-band drift", async () => {
    const h = await executingHarness({ uiScript: { confirm: true } });
    await h.fire("turn_start");

    // The plugin's own write path: execution state transitions only.
    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    await h.dispatchTool("reins_progress", { note: "mapping the loading path" });
    await h.fire("turn_end");
    await h.fire("turn_start");

    expect(h.ui.dialogs).toEqual([]);
    const held = h.ui.notifies.find((n) => n.message.includes("out-of-band"));
    expect(held).toBeUndefined();
  });

  test("observed plugin writes to contract content are absorbed, not alarmed on", async () => {
    const h = await executingHarness();
    await h.fire("session_shutdown"); // harness-boundary test done; drive the monitor directly

    let state: ReinsState = { phase: "executing", planDir: h.planDir };
    const monitor: DriftMonitor = createDriftMonitor({
      state: () => state,
      setState: (next) => {
        state = next;
      },
      deps: () => h.deps,
      pollIntervalMs: 25,
      debounceMs: 10,
    });
    try {
      await monitor.sync(); // arm
      // The plugin (plan-editing tools, a later ticket) writes contract
      // content and records the write as an observed plugin write.
      h.writePlanFile(
        "300-verify-result.md",
        h.readPlanFile("300-verify-result.md").replace("Verify the migration end to end", "Verify the migrated loader end to end"),
      );
      state = { ...state, pluginContractWrites: ["300-verify-result.md"] };

      await monitor.sync(); // turn-end drift verification

      // Absorbed: no reaction, no gate, the new content is the baseline.
      expect(state.phase).toBe("executing");
      expect(state.pluginContractWrites).toBeUndefined();
      expect(h.ui.dialogs).toEqual([]);
      await monitor.sync();
      expect(h.ui.dialogs).toEqual([]);
    } finally {
      monitor.stop();
    }
  });

  test("an unexplained write alongside an observed plugin write is still out-of-band", async () => {
    // Unscripted dialog: the offer is declined, so the gate stays held.
    const h = await executingHarness();
    await h.fire("session_shutdown");

    let state: ReinsState = { phase: "executing", planDir: h.planDir };
    const monitor: DriftMonitor = createDriftMonitor({
      state: () => state,
      setState: (next) => {
        state = next;
      },
      deps: () => h.deps,
      pollIntervalMs: 25,
      debounceMs: 10,
    });
    try {
      await monitor.sync();
      handEdit(h); // nobody observed this one
      state = { ...state, pluginContractWrites: ["200-implement-change.md"] };

      await monitor.sync();

      expect(state.phase).toBe("reconciling");
      expect(h.ui.dialogs).toHaveLength(1);
    } finally {
      monitor.stop();
    }
  });
});

describe("on detection mutations are held until reconciled", () => {
  test("a declined reconciliation keeps mutations held, steers the model, and re-offers at the next boundary", async () => {
    let answers = 0;
    const h = await executingHarness({
      uiScript: {
        confirm: () => {
          answers += 1;
          return answers !== 1; // decline the first offer, accept the second
        },
      },
    });
    handEdit(h);
    await h.fire("turn_start");

    // Held: the gate is on the widget, the dialog was declined.
    expect(answers).toBe(1);
    expect(LAST_WIDGET(h)).toContain("Gate: reconciling");
    const declined = h.ui.notifies.find((n) => n.message.includes("stays held"));
    expect(declined?.type).toBe("warning");

    // Mutations are refused while the gate holds...
    const start = await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    expect(start.isError).toBe(true);
    expect(start.message).toContain("reconciling");
    // ...and raw writes into the plan directory stay blocked.
    const blocks = await h.fire("tool_call", {
      type: "tool_call",
      toolName: "write",
      input: { path: `${h.planDir}/plan.md`, content: "hand rewrite" },
    });
    expect(blocks[0]).toMatchObject({ block: true });

    // The model receives the steering message while the gate holds.
    const messages: unknown[] = [{ role: "user", content: "Continue.", timestamp: 1 }];
    await h.fire("context", { type: "context", messages });
    const injected = messages[messages.length - 1] as { content: string };
    expect(injected.content).toMatch(/[Oo]ut-of-band plan change detected/);

    // The next boundary re-offers reconciliation; accepting resumes executing.
    await h.fire("turn_start");
    expect(answers).toBe(2);
    expect(LAST_WIDGET(h)).toContain("Gate: executing");
    const resumed = await h.dispatchTool("reins_status");
    expect(resumed.isError).toBe(false);
  });

  test("without an interactive UI the gate holds fail-closed: no dialog, no auto-accept", async () => {
    const h = await executingHarness({ hasUI: false });
    handEdit(h);
    await h.fire("turn_start");

    // The refusal was notified (the requireUi error) and nothing else.
    expect(h.ui.dialogs).toEqual([]);
    expect(h.ui.notifies.some((n) => n.type === "error" && n.message.includes("interactive UI"))).toBe(true);
    expect(LAST_WIDGET(h)).toContain("Gate: reconciling");
    const status = await h.dispatchTool("reins_status");
    expect(status.isError).toBe(true);
    expect(status.message).toContain("reconciling");
  });

  test("the reconciled content becomes the new baseline: the same edit does not re-alarm", async () => {
    const h = await executingHarness({ uiScript: { confirm: true } });
    handEdit(h);
    await h.fire("turn_start");
    expect(h.ui.dialogs).toHaveLength(1);

    await h.fire("turn_end");
    await h.fire("turn_start");
    expect(h.ui.dialogs).toHaveLength(1);
  });
});

describe("detection is scoped to an active contract", () => {
  test("without a contract nothing is detected, watched, or held", async () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    handEdit(h);
    await h.fire("turn_start");
    await h.fire("turn_end");

    expect(h.ui.dialogs).toEqual([]);
    expect(h.ui.widgets).toEqual([]);
    expect(h.steering.forced).toEqual([]);
  });

  test("an attached but not yet active contract is not watched for drift", async () => {
    const h = makeHarness({ planDir: "plan-valid", now: FIXED_NOW });
    await h.runCommand("reins-attach", "plan");
    handEdit(h);
    await h.fire("turn_start");

    expect(h.ui.dialogs).toEqual([]);
    expect(h.steering.forced.filter((t) => t.reason === "out-of-band")).toEqual([]);
  });
});
