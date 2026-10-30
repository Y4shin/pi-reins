/**
 * The contract fingerprint (plan-directory module seam, real fixture
 * directories): a canonical hash over contract-significant content
 * only, per the fs-contract split. Execution state (executionStatus,
 * blockedReason, completionSummary, progressLog) and proposal
 * record-keeping never move it, so the plugin's own writes stay
 * invisible to out-of-band detection. Unparseable files (a partially
 * written document mid-flight) are hashed by raw content: the
 * fingerprint never crashes and still detects the write completing.
 */

import { afterEach, describe, expect, test } from "vitest";

import { contractContentMap, fingerprintContract } from "../../src/plan/fingerprint.js";
import { discoverPlanDir } from "../../src/plan/discover.js";
import { createNodeFsPort } from "../../src/plan/fs.js";
import { writeFields } from "../../src/plan/write.js";
import { cleanupFixtures, copyFixture, writeFixtureFile } from "../harness/fixtures.js";

afterEach(() => {
  cleanupFixtures();
});

function scanFixture(name: string) {
  const dir = copyFixture(name);
  const fs = createNodeFsPort(dir);
  return { dir, fs, scan: () => discoverPlanDir(fs, dir), fingerprint: () => fingerprintContract(fs, discoverPlanDir(fs, dir)) };
}

describe("fingerprintContract", () => {
  test("is stable across rescans of an unchanged directory", () => {
    const { fingerprint } = scanFixture("plan-active");
    expect(fingerprint()).toBe(fingerprint());
  });

  test("a hand edit to contract-significant task content changes it", () => {
    const { dir, fs, fingerprint } = scanFixture("plan-active");
    const before = fingerprint();
    writeFixtureFile(
      dir,
      "100-inspect-current-system.md",
      fs
        .read("100-inspect-current-system.md")
        .replace("Map how configuration is loaded today", "Map only the entry points of how configuration is loaded"),
    );
    expect(fingerprint()).not.toBe(before);
  });

  test("plugin execution-state writes leave it unchanged", () => {
    const { dir, fs, fingerprint, scan } = scanFixture("plan-active");
    const before = fingerprint();
    const now = () => "2026-10-01T12:00:00.000Z";
    const deps = { fs, now };
    // The plugin's own write path: writeFields re-stamps generated and
    // flips execution state. None of that is contract-significant.
    writeFields(deps, "100-inspect-current-system.md", {
      executionStatus: "in_progress",
      progressLog: [{ at: now(), note: "started mapping" }],
    });
    writeFields(deps, "200-implement-change.md", {
      executionStatus: "blocked",
      blockedReason: "Waiting on the build",
    });
    writeFields(deps, "300-verify-result.md", {
      executionStatus: "done",
      completionSummary: "All criteria met.",
    });
    expect(scan().tasks).toHaveLength(3);
    expect(fingerprint()).toBe(before);
  });

  test("proposal record-keeping leaves it unchanged", () => {
    const { dir, fs, fingerprint } = scanFixture("plan-active");
    const before = fingerprint();
    writeFixtureFile(
      dir,
      "proposals/cp-add-cli-migration.md",
      `${fs.read("proposals/cp-add-cli-migration.md")}\nA hand-edited extra rationale line.\n`,
    );
    expect(fingerprint()).toBe(before);
  });

  test("plan prose and goal are significant; the plan execution status is not", () => {
    const { dir, fs, fingerprint } = scanFixture("plan-active");
    const before = fingerprint();
    writeFixtureFile(
      dir,
      "plan.md",
      fs
        .read("plan.md")
        .replace("executionStatus: active", "executionStatus: completed"),
    );
    expect(fingerprint()).toBe(before);

    writeFixtureFile(
      dir,
      "plan.md",
      fs
        .read("plan.md")
        .replace(
          "The legacy loading mechanism is the main\nrisk area.",
          "The legacy loading mechanism and the CLI surface are the main risk areas.",
        ),
    );
    expect(fingerprint()).not.toBe(before);
  });

  test("task addition and removal change it", () => {
    const { dir, fs, fingerprint } = scanFixture("plan-active");
    const before = fingerprint();
    writeFixtureFile(dir, "400-extra-task.md", [
      "---",
      "type: Task",
      "id: extra-task",
      "title: Extra task",
      "executionStatus: pending",
      "---",
      "",
      "# Task",
      "",
      "## Description",
      "",
      "Extra work added out of band.",
      "",
      "## Acceptance Criteria",
      "",
      "- The addition is detected.",
      "",
      "## Constraints",
      "",
      "- None.",
      "",
    ].join("\n"));
    const withExtra = fingerprint();
    expect(withExtra).not.toBe(before);

    fs.delete("400-extra-task.md");
    expect(fingerprint()).toBe(before);
  });

  test("a partially written file never crashes and is detected once the write completes", () => {
    const { dir, fs, fingerprint } = scanFixture("plan-active");
    const before = fingerprint();
    // A mid-write snapshot: the frontmatter fence is open, no closing
    // fence, the body truncated. Exactly what a concurrent read sees.
    const partial = [
      "---",
      "type: Task",
      "id: inspect-current-system",
      "title: Inspect the current sys",
    ].join("\n");
    writeFixtureFile(dir, "100-inspect-current-system.md", partial);

    const during = fingerprint();
    expect(during).not.toBe(before);
    // Stable across rescans while the file stays partially written.
    expect(fingerprint()).toBe(during);

    // The write completes with new content: still detected, not absorbed.
    writeFixtureFile(dir, "100-inspect-current-system.md", [
      "---",
      "type: Task",
      "id: inspect-current-system",
      "title: Inspect the current system",
      "executionStatus: pending",
      "---",
      "",
      "# Task",
      "",
      "## Description",
      "",
      "Rewritten out of band.",
      "",
      "## Acceptance Criteria",
      "",
      "- The rewrite is detected.",
      "",
      "## Constraints",
      "",
      "- None.",
      "",
    ].join("\n"));
    expect(fingerprint()).not.toBe(during);
    expect(fingerprint()).not.toBe(before);
  });

  test("the canonical content map names the significant files and carries raw content for unparseable ones", () => {
    const { dir, fs } = scanFixture("plan-active");
    const map = contractContentMap(fs, discoverPlanDir(fs, dir));
    expect([...map.keys()].sort()).toEqual([
      "100-inspect-current-system.md",
      "200-implement-change.md",
      "300-verify-result.md",
      "plan.md",
    ]);

    // A document whose frontmatter does not parse is hashed by raw
    // content, so its later completion is still a change.
    writeFixtureFile(dir, "999-broken.md", "---\ntype: [broken\n");
    const withBroken = contractContentMap(fs, discoverPlanDir(fs, dir));
    expect(withBroken.get("999-broken.md")).toBe(fs.read("999-broken.md"));
  });
});
