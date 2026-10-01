/**
 * Renegotiation triggers and the batched proposal session.
 *
 * Triggers (arch spec, ticket 9): current-work bearing, imminent-work
 * entanglement at task start, exhaustion of eligible agreed work, and
 * initiative (the reins_renegotiate tool and the /reins-renegotiate
 * command). The session presents every pending proposal (deferred ones
 * included) one blocking approve/defer/reject dialog each, applies the
 * dispositions durably when the sweep completes, and terminates the run
 * at the gate. Driven through the shared harness seams.
 */

import { afterEach, describe, expect, test } from "vitest";

import { discoverPlanDir } from "../src/plan/discover.js";
import { shouldOpenSession } from "../src/handlers/renegotiate.js";
import type { ReinsState } from "../src/state.js";
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

/** An executing state bound to the harness plan directory. */
function executingState(h: ReinsHarness): ReinsState {
  return { phase: "executing", planDir: h.planDir };
}

describe("shouldOpenSession: trigger evaluation", () => {
  test("current-work: a non-deferred proposal bearing on an in_progress task triggers", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    // The fixture's proposal does not bear on any task; give it a
    // target so it bears on the task about to be in progress.
    h.writePlanFile(
      "proposals/cp-add-cli-migration.md",
      h
        .readPlanFile("proposals/cp-add-cli-migration.md")
        .replace("kind: add", "kind: add\ntarget: inspect-current-system"),
    );

    // No task is in progress yet: no trigger.
    const idle = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), idle, { kind: "current-work" })).toBe(false);

    // The bearing proposal triggers once the task is in progress.
    h.writePlanFile(
      "100-inspect-current-system.md",
      h.readPlanFile("100-inspect-current-system.md").replace(
        "executionStatus: pending",
        "executionStatus: in_progress",
      ),
    );
    const active = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), active, { kind: "current-work" })).toBe(true);
  });

  test("current-work: deferred proposals never trigger a session", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    h.writePlanFile(
      "proposals/cp-add-cli-migration.md",
      h
        .readPlanFile("proposals/cp-add-cli-migration.md")
        .replace(
          "kind: add",
          "kind: add\ntarget: inspect-current-system\ndeferred: true",
        ),
    );
    h.writePlanFile(
      "100-inspect-current-system.md",
      h.readPlanFile("100-inspect-current-system.md").replace(
        "executionStatus: pending",
        "executionStatus: in_progress",
      ),
    );
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), scan, { kind: "current-work" })).toBe(false);
    // Deliberate opening is still possible: initiative ignores deferrals.
    expect(shouldOpenSession(executingState(h), scan, { kind: "initiative" })).toBe(true);
  });

  test("task-start: a non-deferred proposal bearing on the started task triggers", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    expect(
      shouldOpenSession(executingState(h), scan, {
        kind: "task-start",
        taskId: "verify-result",
      }),
    ).toBe(false);

    h.writePlanFile(
      "proposals/cp-modify-verify.md",
      [
        "---",
        "type: Change Proposal",
        "id: cp-modify-verify",
        "kind: modify",
        "target: verify-result",
        'title: Narrow the verification',
        "---",
        "",
        "# Change Proposal: Narrow the verification",
        "",
        "## Rationale",
        "",
        "The full-suite comparison is redundant with the focused tests.",
        "",
      ].join("\n"),
    );
    const bearing = discoverPlanDir(h.deps.fs, h.planDir);
    expect(
      shouldOpenSession(executingState(h), bearing, {
        kind: "task-start",
        taskId: "verify-result",
      }),
    ).toBe(true);
    // Entanglement is per task: other starts are unaffected.
    expect(
      shouldOpenSession(executingState(h), bearing, {
        kind: "task-start",
        taskId: "inspect-current-system",
      }),
    ).toBe(false);
  });

  test("exhaustion: nothing startable with a non-deferred proposal pending triggers", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    // Work remains: no exhaustion.
    expect(shouldOpenSession(executingState(h), scan, { kind: "exhaustion" })).toBe(false);

    for (const file of [
      "100-inspect-current-system.md",
      "200-implement-change.md",
      "300-verify-result.md",
    ]) {
      h.writePlanFile(
        file,
        h.readPlanFile(file).replace("executionStatus: pending", "executionStatus: done"),
      );
    }
    const done = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), done, { kind: "exhaustion" })).toBe(true);

    // A deferred-only pending set never triggers.
    h.writePlanFile(
      "proposals/cp-add-cli-migration.md",
      h
        .readPlanFile("proposals/cp-add-cli-migration.md")
        .replace("kind: add", "kind: add\ndeferred: true"),
    );
    const deferredOnly = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), deferredOnly, { kind: "exhaustion" })).toBe(false);
  });

  test("exhaustion: a task still in progress means work is not exhausted", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    for (const file of ["200-implement-change.md", "300-verify-result.md"]) {
      h.writePlanFile(
        file,
        h.readPlanFile(file).replace("executionStatus: pending", "executionStatus: done"),
      );
    }
    h.writePlanFile(
      "100-inspect-current-system.md",
      h.readPlanFile("100-inspect-current-system.md").replace(
        "executionStatus: pending",
        "executionStatus: in_progress",
      ),
    );
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), scan, { kind: "exhaustion" })).toBe(false);
  });

  test("initiative triggers in executing and in no other phase", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), scan, { kind: "initiative" })).toBe(true);
    for (const phase of ["detached", "attached", "renegotiating", "plan-editing", "reviewing", "reconciling", "completed"] as const) {
      expect(shouldOpenSession({ phase, planDir: h.planDir }, scan, { kind: "initiative" })).toBe(false);
    }
    expect(shouldOpenSession({ phase: "executing" }, scan, { kind: "initiative" })).toBe(false);
  });
});
