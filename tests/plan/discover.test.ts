import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import { discoverPlanDir } from "../../src/plan/discover.js";
import { createNodeFsPort } from "../../src/plan/fs.js";

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

  test("reports a missing plan document as a finding instead of crashing", () => {
    const dir = makePlanDir({ "notes.md": "---\ntype: Context\n---\n\nnothing here\n" });

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    expect(scan.plan).toBeUndefined();
    expect(scan.findings).toEqual([
      { file: "plan.md", rule: "missing-plan-document", message: expect.any(String) },
    ]);
  });
});
