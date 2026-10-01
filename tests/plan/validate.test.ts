/**
 * Attach-time validation rule classes, one malformed fixture per
 * class (seam 3: the plan-directory module against real fixture
 * directories). Every violation is reported, not only the first.
 */

import { afterEach, describe, expect, test } from "vitest";

import { discoverPlanDir } from "../../src/plan/discover.js";
import { createNodeFsPort } from "../../src/plan/fs.js";
import { validatePlan } from "../../src/plan/validate.js";
import { cleanupFixtures, copyFixture } from "../harness/fixtures.js";

function validateFixture(name: string) {
  const dir = copyFixture(name);
  return validatePlan(discoverPlanDir(createNodeFsPort(dir), dir));
}

afterEach(() => {
  cleanupFixtures();
});

describe("validatePlan rule classes", () => {
  test("the conforming sample plan produces no violations", () => {
    expect(validateFixture("plan-valid")).toEqual([]);
  });

  test("frontmatter class: upstream hard rules surface as violations", () => {
    const violations = validateFixture("malformed-unparseable-frontmatter");
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "plan.md", rule: "unparseable-frontmatter" }),
    );
  });

  test("frontmatter class: the root index carries no frontmatter beyond okf_version", () => {
    const violations = validateFixture("malformed-index-frontmatter");
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "index.md", rule: "index-frontmatter-keys" }),
    );
  });

  test("profile class: okf_version is pinned and the root log is mandatory", () => {
    const violations = validateFixture("malformed-okf-version");
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "index.md", rule: "okf-version" }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "log.md", rule: "missing-reserved-file" }),
    );
  });

  test("profile class: plan.md declares the plan type and its required metadata", () => {
    const violations = validateFixture("malformed-plan-metadata");
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "plan.md", rule: "plan-type" }),
    );
    const missing = violations.filter((v) => v.rule === "missing-required-field");
    expect(missing.map((v) => v.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("schemaVersion"), expect.stringContaining("goal")]),
    );
  });

  test("report completeness: violations from every rule class are named, not only the first", () => {
    const violations = validateFixture("malformed-multi");
    const rules = new Set(violations.map((v) => v.rule));
    // Defects span four rule classes across four files; every one of
    // them must appear in the same report.
    expect(rules).toContain("duplicate-task-id");
    expect(rules).toContain("execution-status-vocabulary");
    expect(rules).toContain("missing-binding-section");
    expect(rules).toContain("log-entry-vocabulary");
    expect(violations.length).toBeGreaterThanOrEqual(4);
  });

  test("log class: date headings and the closed entry vocabulary hold", () => {
    const violations = validateFixture("malformed-log-structure");
    expect(violations).toContainEqual(
      expect.objectContaining({
        file: "log.md",
        rule: "log-heading-format",
        message: expect.stringContaining("Introduction"),
      }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({
        file: "log.md",
        rule: "log-entry-vocabulary",
        message: expect.stringContaining("Tweak"),
      }),
    );
  });

  test("reserved-filename class: reserved files never serve as task, phase, or plan documents", () => {
    const dir = copyFixture("malformed-reserved-filename");
    const scan = discoverPlanDir(createNodeFsPort(dir), dir);
    const violations = validatePlan(scan);
    // The reserved files carry execution roles and are flagged...
    const reserved = violations.filter((v) => v.rule === "reserved-filename-role");
    expect(reserved.map((v) => v.file).sort()).toEqual(["sub/index.md", "sub/plan.md"]);
    // ...and they never silently become contract documents.
    expect(scan.tasks).toEqual([]);
    expect(scan.supporting).toContain("sub/index.md");
  });

  test("id class: task ids are required and unique within the plan", () => {
    const violations = validateFixture("malformed-duplicate-ids");
    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: "duplicate-task-id",
        message: expect.stringContaining("shared-task"),
      }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "300-third.md", rule: "missing-task-id" }),
    );
  });

  test("vocabulary class: executionStatus values stay within their document vocabularies", () => {
    const violations = validateFixture("malformed-status-vocabulary");
    const statusViolations = violations.filter((v) => v.rule === "execution-status-vocabulary");
    // plan.md carries a task-only value; 100-wrong-value.md an unknown
    // value; 200-no-status.md none at all.
    expect(statusViolations.map((v) => v.file).sort()).toEqual([
      "100-wrong-value.md",
      "200-no-status.md",
      "plan.md",
    ]);
    expect(statusViolations.some((v) => v.message.includes("proposed, active, completed"))).toBe(true);
    expect(statusViolations.some((v) => v.message.includes("pending, in_progress, blocked, done"))).toBe(true);
  });

  test("binding class: every required section is present and no unknown subheading binds", () => {
    const violations = validateFixture("malformed-binding-sections");
    expect(violations).toContainEqual(
      expect.objectContaining({
        file: "100-missing-criteria.md",
        rule: "missing-binding-section",
        message: expect.stringContaining("Acceptance Criteria"),
      }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({
        file: "200-extra-heading.md",
        rule: "unknown-task-subheading",
        message: expect.stringContaining("Notes"),
      }),
    );
  });

  test("proposal class: id, kind, target, draft content, rationale, and dependency hints hold", () => {
    const violations = validateFixture("malformed-proposals");
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "proposals/100-unknown-kind.md", rule: "proposal-kind" }),
    );
    // Both an unresolvable and a missing target violate the target rule.
    const targetViolations = violations.filter((v) => v.rule === "proposal-target");
    expect(targetViolations.map((v) => v.file).sort()).toEqual([
      "proposals/200-unresolvable-target.md",
      "proposals/300-remove-without-target.md",
    ]);
    expect(violations).toContainEqual(
      expect.objectContaining({
        file: "proposals/400-add-missing-draft.md",
        rule: "proposal-draft",
        message: expect.stringContaining("Acceptance Criteria"),
      }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "proposals/500-missing-id.md", rule: "proposal-id" }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "proposals/600-missing-rationale.md", rule: "proposal-rationale" }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "proposals/700-bad-dependency-hints.md", rule: "proposal-dependencies" }),
    );
  });

  test("proposal class: the well-formed sample proposal raises no proposal violations", () => {
    const violations = validateFixture("plan-valid").filter((v) => v.rule.startsWith("proposal-"));
    expect(violations).toEqual([]);
  });
});
