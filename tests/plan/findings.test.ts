import { describe, expect, test } from "vitest";

import { discoverPlanDir } from "../../src/plan/discover.js";
import { createNodeFsPort } from "../../src/plan/fs.js";
import { cleanupFixtures, copyFixture } from "../harness/fixtures.js";

describe("parse findings (malformed-plan family)", () => {
  test("unparseable frontmatter is a finding, not a crash", () => {
    const dir = copyFixture("malformed-unparseable-frontmatter");

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    expect(
      scan.findings.some(
        (f) => f.file === "plan.md" && f.rule === "unparseable-frontmatter",
      ),
    ).toBe(true);
    // The unparseable file still surfaces, as a supporting path.
    expect(scan.supporting).toContain("plan.md");
    expect(scan.plan).toBeUndefined();
  });

  test("frontmatter that is not a mapping is a finding, not a crash", () => {
    const dir = copyFixture("malformed-frontmatter-not-mapping");

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    expect(
      scan.findings.some(
        (f) => f.file === "plan.md" && f.rule === "frontmatter-not-mapping",
      ),
    ).toBe(true);
    expect(scan.plan).toBeUndefined();
  });

  test("a missing type is a finding and the file is not categorized as a task", () => {
    const dir = copyFixture("malformed-missing-type");

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    expect(
      scan.findings.some((f) => f.file === "100-no-type.md" && f.rule === "missing-type"),
    ).toBe(true);
    expect(scan.tasks).toHaveLength(0);
    expect(scan.supporting).toContain("100-no-type.md");
  });

  test("a task body without the Task H1 is flagged and its binding sections are empty", () => {
    const dir = copyFixture("malformed-task-no-heading");

    const scan = discoverPlanDir(createNodeFsPort(dir), dir);

    expect(
      scan.findings.some(
        (f) => f.file === "100-broken-body.md" && f.rule === "missing-task-heading",
      ),
    ).toBe(true);
    expect(scan.tasks).toHaveLength(1);
    expect(scan.tasks[0]?.binding).toEqual({});
  });
});
