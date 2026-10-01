/**
 * Plan-directory snapshots and fingerprints.
 *
 * `snapshotPlanDir` captures the whole plan directory as an in-memory
 * file map at one instant. The renegotiation session takes the
 * pre-session snapshot the review flow later diffs against and restores
 * on abandon; out-of-band detection (its ticket) adds the fingerprint
 * half beside it. Snapshots are ephemeral by contract: they are never
 * persisted into the plan directory or the session.
 */

import type { FsPort } from "../deps.js";

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
