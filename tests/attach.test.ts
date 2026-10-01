/**
 * The attach flow: `/reins-attach <path>` validates a plan directory
 * against the execution-plan contract and binds it on pass. Driven
 * through the command boundary of the shared harness.
 *
 * Attach never repairs or generates: a failing attach produces the
 * rejection report and nothing else; a passing attach binds in memory
 * and records the plan path as a private session entry, writing
 * nothing into the plan directory.
 */

import { afterEach, describe, expect, test } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

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

describe("reins-attach refusals", () => {
  test("a missing path argument is refused, never improvised around", async () => {
    const h = makeHarness({});

    await h.runCommand("reins-attach", "");

    expect(h.ui.notifies).toHaveLength(1);
    expect(h.ui.notifies[0].type).toBe("error");
    expect(h.ui.notifies[0].message).toContain("no plan directory given");
    expect(h.session.entries).toEqual([]);
  });

  test("a nonexistent plan directory is refused with the missing-root violation", async () => {
    const h = makeHarness({});

    await h.runCommand("reins-attach", "does-not-exist");

    expect(h.ui.notifies).toHaveLength(1);
    expect(h.ui.notifies[0].type).toBe("error");
    expect(h.ui.notifies[0].message).toContain("does-not-exist");
    expect(h.ui.notifies[0].message).toContain("missing-plan-root");
    expect(h.session.entries).toEqual([]);
  });

  test("an insufficient plan (no plan document) is refused with a report", async () => {
    const h = makeHarness({});

    await h.runCommand("reins-attach", "plan");

    expect(h.ui.notifies).toHaveLength(1);
    expect(h.ui.notifies[0].type).toBe("error");
    expect(h.ui.notifies[0].message).toContain("missing-plan-document");
    expect(h.session.entries).toEqual([]);
  });

  test("a plan path pointing at a file is refused, not crashed on", async () => {
    const h = makeHarness({});
    writeFileSync(join(h.root, "not-a-dir.md"), "just a file\n", "utf8");

    await h.runCommand("reins-attach", "not-a-dir.md");

    expect(h.ui.notifies).toHaveLength(1);
    expect(h.ui.notifies[0].type).toBe("error");
    expect(h.ui.notifies[0].message).toContain("missing-plan-document");
    expect(h.session.entries).toEqual([]);
  });

  test("a completed plan is refused: there is nothing left to execute", async () => {
    const h = makeHarness({ planDir: "plan-completed" });

    await h.runCommand("reins-attach", "plan");

    expect(h.ui.notifies).toHaveLength(1);
    expect(h.ui.notifies[0].type).toBe("error");
    expect(h.ui.notifies[0].message).toContain("completed");
    expect(h.session.entries).toEqual([]);
  });

  test("a second attach while a contract is bound is refused", async () => {
    const h = makeHarness({ planDir: "plan-valid" });

    await h.runCommand("reins-attach", "plan");
    await h.runCommand("reins-attach", "plan");

    expect(h.ui.notifies).toHaveLength(2);
    expect(h.ui.notifies[1].type).toBe("error");
    expect(h.ui.notifies[1].message).toContain("already attached");
    expect(h.session.entries).toHaveLength(1);
  });
});

describe("reins-attach", () => {
  test("the rejection report names every violation with its rule, not only the first", async () => {
    const h = makeHarness({ planDir: "malformed-multi" });

    await h.runCommand("reins-attach", "plan");

    expect(h.ui.notifies).toHaveLength(1);
    expect(h.ui.notifies[0].type).toBe("error");
    const report = h.ui.notifies[0].message;
    // Defects across four rule classes and four files, all in one report.
    for (const rule of [
      "duplicate-task-id",
      "execution-status-vocabulary",
      "missing-binding-section",
      "log-entry-vocabulary",
    ]) {
      expect(report).toContain(rule);
    }
    for (const file of ["100-first.md", "200-second.md", "300-third.md", "log.md"]) {
      expect(report).toContain(file);
    }
    // Nothing bound: no session entry, state stays detached.
    expect(h.session.entries).toEqual([]);
  });

  test("attaching a plan whose executionStatus is already active enters executing", async () => {
    const h = makeHarness({ planDir: "plan-active" });

    await h.runCommand("reins-attach", "plan");

    expect(h.ui.notifies).toHaveLength(1);
    expect(h.ui.notifies[0].type).toBe("info");
    expect(h.session.entries).toEqual([
      { customType: "reins-attached", data: { planDir: h.planDir, phase: "executing" } },
    ]);
  });

  test("a conforming plan attaches cleanly", async () => {
    const h = makeHarness({ planDir: "plan-valid" });
    const before = h.planFiles().join("\n");

    await h.runCommand("reins-attach", "plan");

    expect(h.api.registeredCommands()).toContain("reins-attach");
    // One info notification carrying the goal: the attach report.
    expect(h.ui.notifies).toHaveLength(1);
    expect(h.ui.notifies[0].type).toBe("info");
    expect(h.ui.notifies[0].message).toContain(
      "Migrate configuration loading to the new provider model",
    );
    // The plan path is recorded as a private session entry, bound as attached.
    expect(h.session.entries).toEqual([
      { customType: "reins-attached", data: { planDir: h.planDir, phase: "attached" } },
    ]);
    // Attach never repairs or generates: the plan directory is untouched.
    expect(h.planFiles().join("\n")).toBe(before);
  });
});
