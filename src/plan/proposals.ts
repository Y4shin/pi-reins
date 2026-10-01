/**
 * The proposal store: the read surface over a plan scan's change
 * proposals, shared by the widget's pending count and the
 * renegotiation triggers.
 *
 * Proposals are never execution-eligible: they live apart from task
 * documents (discovery separates them by type), and dispositioning one
 * is a renegotiation outcome, never an execution act. The pending set
 * is every recorded proposal: approved ones are deleted at review
 * acceptance, rejected ones when the renegotiating state ends, and
 * deferred ones stay, marked `deferred`.
 */

import type { PlanScan } from "./discover.js";
import type { ProposalDocument } from "./parse.js";

export interface ProposalStore {
  /** Every proposal in the pending set (deferred ones included). */
  pending(): ProposalDocument[];
  /** The deferred subset of the pending set. */
  deferred(): ProposalDocument[];
  /**
   * Proposals bearing on a task: the proposal targets it, or the task
   * id appears in its dependsOn or enables hints.
   */
  bearingOn(taskId: string): ProposalDocument[];
}

export function proposalStore(scan: PlanScan): ProposalStore {
  return {
    pending: () => [...scan.proposals],
    deferred: () => scan.proposals.filter((proposal) => proposal.frontmatter.deferred === true),
    bearingOn: (taskId: string) =>
      scan.proposals.filter((proposal) => {
        if (proposal.frontmatter.target === taskId) return true;
        for (const hint of ["dependsOn", "enables"] as const) {
          const ids = proposal.frontmatter[hint];
          if (Array.isArray(ids) && ids.includes(taskId)) return true;
        }
        return false;
      }),
  };
}
