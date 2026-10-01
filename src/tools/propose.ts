/**
 * The reins_propose_change tool: records a change proposal document
 * under proposals/ per the execution-plan contract. Proposals are
 * durable records of suggested changes, never executed before
 * approval; recording validates and writes, and applies nothing.
 *
 * Every call rescans the plan directory (no caching, ever), refuses
 * outside an active contract, stamps `generated`, and serializes the
 * write through pi's `withFileMutationQueue`.
 */

import { join } from "node:path";

import {
  withFileMutationQueue,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { ReinsDeps } from "../deps.js";
import { discoverPlanDir, type PlanScan } from "../plan/discover.js";
import { dumpDocument, type FrontmatterData } from "../plan/parse.js";
import { generatedBy } from "../plan/write.js";
import type { ReinsState } from "../state.js";

/** The deps-and-state accessors every plugin tool executes through. */
export interface ProposeToolIo {
  /** Fresh deps per execution; the wiring roots the fs port at the plan directory. */
  deps: (ctx: unknown) => ReinsDeps;
  /** Live read of the ephemeral plugin state. */
  state: () => ReinsState;
}

/** One-line text result, the shape pi surfaces to the model. */
export interface ProposeToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, never>;
}

function result(text: string): ProposeToolResult {
  return { content: [{ type: "text", text }], details: {} };
}

/** The bound, executing plan directory, or a refusal naming what is missing. */
function requireExecutingContract(state: ReinsState, toolName: string): string {
  if (state.phase === "detached" || state.planDir === undefined) {
    throw new Error(`${toolName}: no contract is attached; run /reins-attach <path> first.`);
  }
  if (state.phase !== "executing") {
    throw new Error(`${toolName}: the contract is not active (phase: ${state.phase}).`);
  }
  return state.planDir;
}

/** Compose the proposal document body per the fs-contract: the rationale, plus the draft task content for additions. */
function composeProposalBody(params: {
  kind: string;
  title: string;
  rationale: string;
  proposedId?: string;
  proposedTitle?: string;
  description?: string;
  acceptanceCriteria?: string;
  constraints?: string;
}): string {
  const lines: string[] = [`# Change Proposal: ${params.title}`, "", "## Rationale", "", params.rationale, ""];
  if (params.kind === "add") {
    lines.push(
      "## Proposed task (draft)",
      "",
      `id: ${params.proposedId}`,
      `title: ${params.proposedTitle}`,
      "",
      "## Description",
      "",
      params.description ?? "",
      "",
      "## Acceptance Criteria",
      "",
      params.acceptanceCriteria ?? "",
      "",
      "## Constraints",
      "",
      params.constraints ?? "",
      "",
    );
  }
  return lines.join("\n");
}

/** The proposal kinds, per the execution-plan contract. */
const PROPOSAL_KINDS = ["add", "modify", "remove"] as const;

type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/**
 * Slug a title or task id into a proposal-id fragment: lowercase,
 * non-alphanumerics collapsed to single dashes.
 */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug === "" ? "change" : slug;
}

/** Find a task by semantic id in a scan; the refusal names the known ids. */
function findTask(scan: PlanScan, taskId: string): boolean {
  return scan.tasks.some((candidate) => candidate.frontmatter.id === taskId);
}

/** Record a change proposal: writes a proposal document under proposals/. */
export async function proposeChange(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
): Promise<ProposeToolResult> {
  const planDir = requireExecutingContract(state, "reins_propose_change");
  const kind = params.kind;
  const rationale = params.rationale;

  if (typeof kind !== "string" || !(PROPOSAL_KINDS as readonly string[]).includes(kind)) {
    throw new Error(
      `reins_propose_change: kind must be one of ${PROPOSAL_KINDS.join(", ")} (got: ${String(kind)}).`,
    );
  }
  if (typeof rationale !== "string" || rationale.trim() === "") {
    throw new Error("reins_propose_change: a non-empty rationale is required (why the current plan no longer suffices).");
  }

  const scan = discoverPlanDir(deps.fs, planDir);
  const proposalKind = kind as ProposalKind;

  // Modify and remove bind to agreed work: the target must name a task
  // of the contract. Additions draft new work instead.
  let target: string | undefined;
  if (proposalKind === "modify" || proposalKind === "remove") {
    const targetParam = params.target;
    if (typeof targetParam !== "string" || targetParam.trim() === "") {
      throw new Error(
        `reins_propose_change: target is required for kind ${proposalKind} (the target task's semantic id).`,
      );
    }
    if (!findTask(scan, targetParam)) {
      const known = scan.tasks.map((candidate) => String(candidate.frontmatter.id ?? "(no id)")).join(", ");
      throw new Error(
        `reins_propose_change: no task with id "${targetParam}" in the contract (known ids: ${known || "none"}).`,
      );
    }
    target = targetParam;
  }

  const proposedId = params.proposedId;
  if (proposalKind === "add" && (typeof proposedId !== "string" || proposedId.trim() === "")) {
    throw new Error("reins_propose_change: proposedId is required for kind add (the draft task's semantic id).");
  }

  const proposedTitle =
    typeof params.proposedTitle === "string" && params.proposedTitle.trim() !== ""
      ? params.proposedTitle
      : (proposedId as string);
  const title =
    typeof params.title === "string" && params.title.trim() !== ""
      ? params.title
      : proposalKind === "add"
        ? proposedTitle
        : (target as string);
  const providedId = typeof params.id === "string" && params.id.trim() !== "" ? params.id.trim() : undefined;
  const proposalId = providedId ?? `cp-${proposalKind}-${slugify(title)}`;

  const frontmatter: FrontmatterData = {
    type: "Change Proposal",
    id: proposalId,
    kind: proposalKind,
    generated: { by: generatedBy(), at: deps.now() },
  };
  if (target !== undefined) frontmatter.target = target;
  const body = composeProposalBody({
    kind: proposalKind,
    title,
    rationale,
    proposedId: typeof proposedId === "string" ? proposedId : undefined,
    proposedTitle,
    description: typeof params.description === "string" ? params.description : undefined,
    acceptanceCriteria: typeof params.acceptanceCriteria === "string" ? params.acceptanceCriteria : undefined,
    constraints: typeof params.constraints === "string" ? params.constraints : undefined,
  });

  const file = `proposals/${proposalId}.md`;
  await withFileMutationQueue(join(planDir, file), async () => {
    deps.fs.write(file, dumpDocument(frontmatter, body));
  });
  return result(`Recorded proposal ${proposalId} (${proposalKind}): ${title}.`);
}

/** Build the reins_propose_change tool definition over injected deps and state accessors. */
export function createProposeTool(io: ProposeToolIo): ToolDefinition<any, any, any> {
  return {
    name: "reins_propose_change",
    label: "Propose a change",
    description:
      "Record a change proposal against the active execution contract: an addition, modification, " +
      "or removal of agreed work. The proposal is durable and visible; it is never executed before " +
      "approval. kind add requires the draft task content (proposedId, proposedTitle, description, " +
      "acceptanceCriteria, constraints); modify and remove require the target task's semantic id.",
    parameters: Type.Object({
      kind: Type.Union([Type.Literal("add"), Type.Literal("modify"), Type.Literal("remove")], {
        description: "What kind of change is proposed",
      }),
      rationale: Type.String({
        description: "Why the current plan no longer suffices, and why the change is necessary or preferable",
      }),
      target: Type.Optional(
        Type.String({ description: "Semantic id of the task the proposal modifies or removes" }),
      ),
      id: Type.Optional(Type.String({ description: "Stable semantic id for the proposal (generated when omitted)" })),
      title: Type.Optional(Type.String({ description: "Human-readable display name of the proposal" })),
      proposedId: Type.Optional(
        Type.String({ description: "Draft task id for kind add (the proposed task's semantic id)" }),
      ),
      proposedTitle: Type.Optional(
        Type.String({ description: "Draft task title for kind add" }),
      ),
      description: Type.Optional(
        Type.String({ description: "Draft Description binding section for kind add" }),
      ),
      acceptanceCriteria: Type.Optional(
        Type.String({ description: "Draft Acceptance Criteria binding section for kind add" }),
      ),
      constraints: Type.Optional(
        Type.String({ description: "Draft Constraints binding section for kind add" }),
      ),
      dependsOn: Type.Optional(
        Type.Array(Type.String(), {
          description: "Task or proposal ids this proposed work depends on",
        }),
      ),
      enables: Type.Optional(
        Type.Array(Type.String(), {
          description: "Task ids that probably depend on this proposed work",
        }),
      ),
    }),
    execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
      proposeChange(io.deps(ctx), io.state(), params),
  };
}
