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

/**
 * Optional dependency hints: when present, a list of non-empty ids.
 * They are hints, not resolved references: dependsOn may name proposal
 * ids recorded later, so recording checks shape only.
 */
function idListParam(params: Record<string, unknown>, name: "dependsOn" | "enables"): string[] | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || (entry as string).trim() === "")) {
    throw new Error(
      `reins_propose_change: ${name} must be a list of task or proposal ids when given (got: ${JSON.stringify(value)}).`,
    );
  }
  return value as string[];
}

/** Reserved filenames keep their OKF meaning at every level, including under proposals/. */
const RESERVED_NAMES = new Set(["index", "log"]);

/** The proposal ids already recorded in the plan directory. */
function existingProposalIds(deps: ReinsDeps): Set<string> {
  if (!deps.fs.exists("proposals")) return new Set();
  return new Set(
    deps.fs
      .list("proposals")
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.slice("proposals/".length, -".md".length)),
  );
}

/**
 * Resolve the new proposal's id: a caller-provided id is refused when
 * it already exists or would sit on a reserved filename; a generated
 * id is deduplicated with a numeric suffix instead.
 */
function resolveProposalId(providedId: string | undefined, base: string, existing: Set<string>): string {
  if (providedId !== undefined) {
    if (existing.has(providedId)) {
      throw new Error(
        `reins_propose_change: a proposal with id "${providedId}" already exists; choose a different id.`,
      );
    }
    if (RESERVED_NAMES.has(providedId)) {
      throw new Error(
        `reins_propose_change: the proposal id "${providedId}" collides with a reserved filename ` +
          "(index.md and log.md are reserved at every level).",
      );
    }
    return providedId;
  }
  let id = base;
  for (let n = 2; existing.has(id); n++) id = `${base}-${n}`;
  return id;
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
  if (proposalKind === "add") {
    const missing = (
      [
        ["proposedId", proposedId],
        ["proposedTitle", params.proposedTitle],
        ["description", params.description],
        ["acceptanceCriteria", params.acceptanceCriteria],
        ["constraints", params.constraints],
      ] as Array<[string, unknown]>
    )
      .filter(([, value]) => typeof value !== "string" || (value as string).trim() === "")
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(
        `reins_propose_change: kind add requires the draft task content: ${missing.join(", ")}.`,
      );
    }
  }

  const dependsOn = idListParam(params, "dependsOn");
  const enables = idListParam(params, "enables");

  const draftTitle = typeof params.proposedTitle === "string" ? params.proposedTitle : (proposedId as string);
  const title =
    typeof params.title === "string" && params.title.trim() !== ""
      ? params.title
      : proposalKind === "add"
        ? draftTitle
        : (target as string);
  const providedId = typeof params.id === "string" && params.id.trim() !== "" ? params.id.trim() : undefined;
  const proposalId = resolveProposalId(providedId, `cp-${proposalKind}-${slugify(title)}`, existingProposalIds(deps));

  const frontmatter: FrontmatterData = {
    type: "Change Proposal",
    id: proposalId,
    kind: proposalKind,
    generated: { by: generatedBy(), at: deps.now() },
  };
  if (target !== undefined) frontmatter.target = target;
  if (dependsOn !== undefined) frontmatter.dependsOn = dependsOn;
  if (enables !== undefined) frontmatter.enables = enables;
  const body = composeProposalBody({
    kind: proposalKind,
    title,
    rationale,
    proposedId: typeof proposedId === "string" ? proposedId : undefined,
    proposedTitle: draftTitle,
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
