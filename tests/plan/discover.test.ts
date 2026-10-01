import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import { discoverPlanDir } from "../../src/plan/discover.js";
import { createNodeFsPort } from "../../src/plan/fs.js";
import { cleanupFixtures, copyFixture } from "../harness/fixtures.js";

const tempDirs: string[] = [];

function makePlanDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "reins-plan-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const target = join(dir, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return dir;
}

const PLAN_MD = [
  "---",
  "type: Execution Plan",
  "id: config-migration",
  "title: Configuration loading migration",
  "schemaVersion: 1",
  "goal: Migrate configuration loading to the new provider model",
  "executionStatus: proposed",
  "revision: 1",
  "---",
  "",
  "# Configuration loading migration",
  "",
  "This execution plan migrates configuration loading.",
  "",
].join("\n");

afterAll(() => {
  cleanupFixtures();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("discoverPlanDir", () => {
  test("discovers task documents with binding sections", () => {
    const dir = makePlanDir({
      "plan.md": PLAN_MD,
      "100-implement.md": [
        "---",
        "type: Task",
        "id: implement-change",
        "title: Implement the provider-based loader",
        "executionStatus: pending",
        "expectedPathRegexes:",
        "  - \"^src/config/\"",
        "---",
        "",
        "Advisory preamble from the external planner.",
        "",
        "# Task",
        "",
        "## Description",
        "",
        "Replace the static configuration loader with the provider-based",
        "implementation agreed in the masterplan.",
        "",
        "### Inputs",
        "",
        "The masterplan interface section.",
        "",
        "## Acceptance Criteria",
        "",
        "- The focused configuration tests pass.",
        "",
        "## Constraints",
        "",
        "- Preserve existing public behavior.",
        "- Do not migrate callers as part of this task.",
        "",
        "# Appendix",
        "",
        "Advisory afterword.",
        "",
      ].join("\n"),
    });

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    expect(scan.findings).toEqual([]);
    expect(scan.tasks).toHaveLength(1);
    const task = scan.tasks[0];
    expect(task.file).toBe("100-implement.md");
    expect(task.frontmatter.id).toBe("implement-change");
    expect(task.frontmatter.expectedPathRegexes).toEqual(["^src/config/"]);
    expect(task.binding.description).toBe(
      "Replace the static configuration loader with the provider-based\n" +
        "implementation agreed in the masterplan.\n\n### Inputs\n\nThe masterplan interface section.",
    );
    expect(task.binding.acceptanceCriteria).toBe("- The focused configuration tests pass.");
    expect(task.binding.constraints).toBe(
      "- Preserve existing public behavior.\n- Do not migrate callers as part of this task.",
    );
  });

  test("discovers the plan document with frontmatter and body", () => {
    const dir = makePlanDir({
      "plan.md": [
        "---",
        "type: Execution Plan",
        "id: config-migration",
        "title: Configuration loading migration",
        "schemaVersion: 1",
        "goal: Migrate configuration loading to the new provider model",
        "executionStatus: proposed",
        "revision: 1",
        "---",
        "",
        "# Configuration loading migration",
        "",
        "This execution plan migrates configuration loading.",
        "",
      ].join("\n"),
    });

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    expect(scan.plan).not.toBeNull();
    expect(scan.plan?.file).toBe("plan.md");
    expect(scan.plan?.frontmatter.type).toBe("Execution Plan");
    expect(scan.plan?.frontmatter.id).toBe("config-migration");
    expect(scan.plan?.frontmatter.goal).toBe(
      "Migrate configuration loading to the new provider model",
    );
    expect(scan.plan?.frontmatter.executionStatus).toBe("proposed");
    expect(scan.plan?.frontmatter.revision).toBe(1);
    expect(scan.plan?.body).toContain("# Configuration loading migration");
    expect(scan.tasks).toEqual([]);
    expect(scan.proposals).toEqual([]);
    expect(scan.findings).toEqual([]);
  });

  test("parses the conforming sample plan fixture end to end", () => {
    const dir = copyFixture("plan-valid");

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    expect(scan.findings).toEqual([]);
    expect(scan.plan?.frontmatter.executionStatus).toBe("proposed");
    expect(scan.plan?.frontmatter.goal).toBe(
      "Migrate configuration loading to the new provider model",
    );
    expect(scan.tasks.map((t) => t.frontmatter.id)).toEqual([
      "inspect-current-system",
      "implement-change",
      "verify-result",
    ]);
    for (const task of scan.tasks) {
      expect(task.binding.description).toBeTruthy();
      expect(task.binding.acceptanceCriteria).toBeTruthy();
      expect(task.binding.constraints).toBeTruthy();
    }
    const implement = scan.tasks.find((t) => t.frontmatter.id === "implement-change");
    expect(implement?.frontmatter.expectedPathRegexes).toEqual([
      "^src/config/",
      "^tests/config/",
    ]);
    const verify = scan.tasks.find((t) => t.frontmatter.id === "verify-result");
    expect(verify?.frontmatter.expectedBashRegexes).toEqual([
      "^npm (install|run|test)",
      "^git (add|commit|status)",
    ]);
    expect(scan.index?.frontmatter.okf_version).toBe("0.2");
    expect(scan.log?.body).toContain("**Creation**");
    expect(scan.proposals).toHaveLength(1);
    expect(scan.proposals[0]?.frontmatter.kind).toBe("add");
    expect(scan.proposals[0]?.frontmatter.id).toBe("cp-add-cli-migration");
    expect(scan.supporting).toEqual(["010-context.md"]);
  });

  test("nested reserved index and log files stay exempt from the type rule", () => {
    const dir = makePlanDir({
      "plan.md": PLAN_MD,
      "sub/index.md": ["# Subsection", "", "* [Something](something.md)"].join("\n"),
      "sub/log.md": ["# Sub Log", "", "## 2026-09-02", "* **Update**: Something happened."].join("\n"),
    });

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    // Reserved at every level: no missing-type findings, never tasks.
    expect(scan.findings).toEqual([]);
    expect(scan.tasks).toEqual([]);
    // Only the root index and log are the scan's index and log.
    expect(scan.index).toBeUndefined();
    expect(scan.log).toBeUndefined();
    expect(scan.supporting).toEqual(["sub/index.md", "sub/log.md"]);
  });

  test("reports a missing plan document as a finding instead of crashing", () => {
    const dir = makePlanDir({ "notes.md": "---\ntype: Context\n---\n\nnothing here\n" });

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    expect(scan.plan).toBeUndefined();
    expect(scan.findings).toEqual([
      { file: "plan.md", rule: "missing-plan-document", message: expect.any(String) },
    ]);
  });
});
