/**
 * The proposal store: the read surface over a scan's change proposals
 * (plan-directory module seam, real fixture directories). This is the
 * forward contract the renegotiation triggers consume: pending(),
 * deferred(), and bearingOn(taskId).
 */

import { afterEach, describe, expect, test } from "vitest";

import { discoverPlanDir } from "../../src/plan/discover.js";
import { createNodeFsPort } from "../../src/plan/fs.js";
import { proposalStore } from "../../src/plan/proposals.js";
import { cleanupFixtures, copyFixture, writeFixtureFile } from "../harness/fixtures.js";

afterEach(() => {
  cleanupFixtures();
});

function scanFixture(name: string) {
  const dir = copyFixture(name);
  return { dir, scan: discoverPlanDir(createNodeFsPort(dir), dir) };
}

describe("proposalStore", () => {
  test("pending() is every recorded proposal, deferred() the marked subset", () => {
    const { dir, scan } = scanFixture("plan-active");
    writeFixtureFile(
      dir,
      "proposals/cp-parked-idea.md",
      [
        "---",
        "type: Change Proposal",
        "id: cp-parked-idea",
        "kind: add",
        "deferred: true",
        "---",
        "",
        "# Change Proposal: Parked idea",
        "",
        "## Rationale",
        "",
        "Parked by an earlier session.",
      ].join("\n"),
    );
    const fresh = discoverPlanDir(createNodeFsPort(dir), dir);
    const store = proposalStore(fresh);

    expect(store.pending().map((p) => p.file).sort()).toEqual([
      "proposals/cp-add-cli-migration.md",
      "proposals/cp-parked-idea.md",
    ]);
    expect(store.deferred().map((p) => p.frontmatter.id)).toEqual(["cp-parked-idea"]);
  });

  test("bearingOn(taskId) matches target, dependsOn, and enables", () => {
    const { dir } = scanFixture("plan-active");
    writeFixtureFile(
      dir,
      "proposals/cp-relates-inspection.md",
      [
        "---",
        "type: Change Proposal",
        "id: cp-relates-inspection",
        "kind: modify",
        "target: inspect-current-system",
        "dependsOn:",
        "  - implement-change",
        "---",
        "",
        "# Change Proposal: Relates to inspection",
        "",
        "## Rationale",
        "",
        "The inspection task needs widening.",
      ].join("\n"),
    );
    writeFixtureFile(
      dir,
      "proposals/cp-enables-verification.md",
      [
        "---",
        "type: Change Proposal",
        "id: cp-enables-verification",
        "kind: add",
        "enables:",
        "  - verify-result",
        "---",
        "",
        "# Change Proposal: Enables verification",
        "",
        "## Rationale",
        "",
        "Verification needs the new surface first.",
        "",
        "## Proposed task (draft)",
        "",
        "id: expose-new-surface",
        "title: Expose the new surface",
        "",
        "## Description",
        "",
        "Expose it.",
        "",
        "## Acceptance Criteria",
        "",
        "- Exposed.",
        "",
        "## Constraints",
        "",
        "- Carefully.",
      ].join("\n"),
    );

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);
    const store = proposalStore(scan);

    // The proposal targets the task...
    expect(store.bearingOn("inspect-current-system").map((p) => p.frontmatter.id)).toEqual([
      "cp-relates-inspection",
    ]);
    // ...or the task id appears in dependsOn...
    expect(store.bearingOn("implement-change").map((p) => p.frontmatter.id)).toEqual([
      "cp-relates-inspection",
    ]);
    // ...or in enables.
    expect(store.bearingOn("verify-result").map((p) => p.frontmatter.id)).toEqual([
      "cp-enables-verification",
    ]);
    // No bearing, no match.
    expect(store.bearingOn("context")).toEqual([]);
  });
});
