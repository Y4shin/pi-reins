/**
 * Plan-directory snapshots and fingerprints.
 *
 * `snapshotPlanDir` captures the whole plan directory as an in-memory
 * file map at one instant. The renegotiation session takes the
 * pre-session snapshot the review flow later diffs against and restores
 * on abandon. `fingerprintContract` is the out-of-band detection half:
 * a canonical hash over contract-significant content only, per the
 * fs-contract split between contract-significant and execution-state
 * changes.
 *
 * Excluded from the fingerprint, so neither the plugin's own writes nor
 * execution bookkeeping ever look out-of-band:
 *
 * - execution state: `executionStatus`, `blockedReason`,
 *   `completionSummary`, `progressLog` (the fs-contract's ordinary
 *   durable execution-state changes),
 * - plugin bookkeeping: `generated` (restamped on every plugin write)
 *   and `verified` (appended by the plugin's review records),
 * - change proposals under `proposals/` (proposal record-keeping is not
 *   contract content),
 * - the bundle index (regenerable navigation, never authoritative), the
 *   log (append-only history, not contract content), and other
 *   supporting files (structurally ignored context).
 *
 * Files whose frontmatter does not parse (including a document caught
 * mid-write) are hashed by raw content: the fingerprint never crashes,
 * stays stable while a file sits partially written, and still detects
 * the write completing. Snapshots and fingerprints are ephemeral by
 * contract: they are never persisted into the plan directory or the
 * session.
 */

import { createHash } from "node:crypto";

import type { FsPort } from "../deps.js";
import type { PlanScan } from "./discover.js";
import type { FrontmatterDoc } from "./parse.js";

/** An in-memory capture of every file under a plan directory. */
export interface PlanSnapshot {
  /** The plan directory root the snapshot was taken against. */
  root: string;
  /** Every file at snapshot time, as plan-relative paths and contents. */
  files: ReadonlyMap<string, string>;
}

/**
 * Read every file under the plan directory into memory. A missing root
 * snapshots as an empty map; per-file read errors surface (the caller
 * decides), matching the fs port's contract.
 */
export function snapshotPlanDir(fs: FsPort, root: string): PlanSnapshot {
  const files = new Map<string, string>();
  if (fs.exists("")) {
    for (const file of fs.list()) {
      files.set(file, fs.read(file));
    }
  }
  return { root, files };
}

/** Frontmatter keys carrying ordinary execution state, per the fs-contract split. */
const EXECUTION_STATE_KEYS = new Set([
  "executionStatus",
  "blockedReason",
  "completionSummary",
  "progressLog",
]);

/** Frontmatter keys the plugin stamps on its own writes (provenance, not contract). */
const PLUGIN_BOOKKEEPING_KEYS = new Set(["generated", "verified"]);

/** Findings whose rule means the document could not be parsed at all. */
const UNPARSEABLE_RULES = new Set(["unparseable-frontmatter", "frontmatter-not-mapping"]);

/** Deterministic JSON: object keys sorted at every depth, no whitespace. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The canonical form of one parsed document: significant frontmatter plus the verbatim body. */
function canonicalDoc(doc: FrontmatterDoc): string {
  const significant: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.frontmatter)) {
    if (!EXECUTION_STATE_KEYS.has(key) && !PLUGIN_BOOKKEEPING_KEYS.has(key)) {
      significant[key] = value;
    }
  }
  return `doc ${stableStringify(significant)} body ${doc.body}`;
}

/**
 * The contract-significant content of a scan, as plan-relative file
 * paths mapped to canonical content: the plan document and every task
 * document (execution state and plugin bookkeeping stripped, frontmatter
 * canonically serialized, body verbatim), plus every unparseable file
 * by its raw content. Added to and removed files show up as map
 * membership changes, so task addition and removal are detected too.
 */
export function contractContentMap(fs: FsPort, scan: PlanScan): Map<string, string> {
  const map = new Map<string, string>();
  if (scan.plan !== undefined) map.set(scan.plan.file, canonicalDoc(scan.plan));
  for (const task of scan.tasks) {
    map.set(task.file, canonicalDoc(task));
  }
  const unparseable = new Set(
    scan.findings.filter((finding) => UNPARSEABLE_RULES.has(finding.rule)).map((finding) => finding.file),
  );
  for (const file of unparseable) {
    if (map.has(file)) continue;
    try {
      // Raw content, verbatim: a partially written file hashes its
      // actual partial bytes, so the write completing is a change.
      map.set(file, fs.read(file));
    } catch {
      // Unreadable beyond being unparseable: nothing to hash; the next
      // scan re-derives it.
    }
  }
  return map;
}

/**
 * The canonical contract fingerprint: a sha256 digest over the sorted
 * contract-significant content of the scan. Two scans of the same
 * contract-significant content hash equal, wherever the plugin or the
 * user placed semantically irrelevant formatting.
 */
export function fingerprintContract(fs: FsPort, scan: PlanScan): string {
  const entries = [...contractContentMap(fs, scan).entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}
