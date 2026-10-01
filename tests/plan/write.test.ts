import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import YAML from "yaml";

import { writeFields } from "../../src/plan/write.js";
import { createNodeFsPort } from "../../src/plan/fs.js";

const tempDirs: string[] = [];

function makePlanDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "reins-write-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content, "utf8");
  }
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const TASK_MD = [
  "---",
  "type: Task",
  "id: implement-change",
  "title: Implement the provider-based loader",
  "executionStatus: pending",
  "---",
  "",
  "# Task",
  "",
  "## Description",
  "",
  "Replace the static configuration loader.",
  "",
  "## Acceptance Criteria",
  "",
  "- The focused configuration tests pass.",
  "",
  "## Constraints",
  "",
  "- Preserve existing public behavior.",
  "",
].join("\n");

describe("writeFields", () => {
  test("sets a frontmatter field and preserves the body verbatim", () => {
    const dir = makePlanDir({ "100-task.md": TASK_MD });
    const fs = createNodeFsPort(dir);
    const fixedNow = () => "2026-10-01T12:00:00Z";

    writeFields({ fs, now: fixedNow }, "100-task.md", { executionStatus: "in_progress" });

    const text = readFileSync(join(dir, "100-task.md"), "utf8");
    const doc = YAML.parseDocument(text.split("---\n")[1]).toJSON() as Record<string, unknown>;
    expect(doc.executionStatus).toBe("in_progress");
    expect(doc.id).toBe("implement-change");
    // Body preserved exactly, including the binding sections.
    expect(text).toContain("## Description");
    expect(text).toContain("Replace the static configuration loader.");
    expect(text).toContain("- Preserve existing public behavior.");
  });

  test("stamps generated with the plugin actor and the injected clock", () => {
    const dir = makePlanDir({ "100-task.md": TASK_MD });
    const fs = createNodeFsPort(dir);

    writeFields({ fs, now: () => "2026-10-01T12:00:00Z" }, "100-task.md", {});

    const text = readFileSync(join(dir, "100-task.md"), "utf8");
    const doc = YAML.parseDocument(text.split("---\n")[1]).toJSON() as Record<string, unknown>;
    const generated = doc.generated as { by: string; at: string };
    expect(generated.by).toMatch(/^pi-reins\//);
    expect(generated.at).toBe("2026-10-01T12:00:00Z");
  });

  test("keeps existing fields and list values intact across a round-trip", () => {
    const withLists = TASK_MD.replace(
      "executionStatus: pending",
      [
        "executionStatus: pending",
        "expectedPathRegexes:",
        '  - "^src/config/"',
        '  - "^tests/config/"',
        "progressLog:",
        "  - at: 2026-09-29T15:30:00Z",
        "    note: Installed the agreed upon packages",
      ].join("\n"),
    );
    const dir = makePlanDir({ "100-task.md": withLists });
    const fs = createNodeFsPort(dir);

    writeFields({ fs, now: () => "2026-10-01T12:00:00Z" }, "100-task.md", {
      executionStatus: "blocked",
      blockedReason: "Waiting for a user decision on backwards compatibility.",
    });

    const text = readFileSync(join(dir, "100-task.md"), "utf8");
    const doc = YAML.parseDocument(text.split("---\n")[1]).toJSON() as Record<string, unknown>;
    expect(doc.executionStatus).toBe("blocked");
    expect(doc.blockedReason).toBe("Waiting for a user decision on backwards compatibility.");
    expect(doc.expectedPathRegexes).toEqual(["^src/config/", "^tests/config/"]);
    expect(doc.progressLog).toEqual([
      { at: "2026-09-29T15:30:00Z", note: "Installed the agreed upon packages" },
    ]);
  });
});
