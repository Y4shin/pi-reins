/**
 * The completion verifier's pi-subagents surface.
 *
 * The verifier is a hard dependency: a fresh-context agent run through
 * pi-subagents judges every plan completion, and its absence is never
 * silently skipped. Registration goes through pi-subagents' runtime
 * agent registration event (a synchronous, process-local contract: the
 * owner writes the result onto the request before emit returns); the
 * run goes through the in-process event-bus RPC spawn.
 *
 * The session_start reconcile attempts the registration once per
 * session and remembers the outcome on the ephemeral state
 * (`verifierUnavailable`). When a contract is bound in the session
 * (the attach record), a failed registration fails visibly: one error
 * notification plus the widget marker. Without a bound contract the
 * plugin stays inert, and completion later refuses with the named
 * error either way.
 *
 * Definition source: the shipped agent definition
 * (`agents/reins-completion-verifier.md`); the runtime registration
 * composes the request from it, so the prompt has one home.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import type { ReinsDeps, VerifierRequest, VerifierResult, VerifierRunner } from "../deps.js";
import { splitFrontmatter } from "../plan/parse.js";
import type { ReinsState } from "../state.js";
import { ATTACHED_ENTRY_TYPE } from "./attach.js";
import { WIDGET_KEY } from "../ui/widget.js";

/** The verifier agent's registered name in pi-subagents. */
export const VERIFIER_AGENT_NAME = "reins-completion-verifier";

/** pi-subagents' runtime agent registration event (protocol version 1). */
export const RUNTIME_AGENT_REGISTER_EVENT = "pi-subagents:runtime-agent-register:v1";

/** The process-local event-bus surface this module touches (a subset of pi.events). */
export interface EventBus {
  on(event: string, handler: (data: unknown) => void): () => void;
  emit(event: string, data: unknown): void;
}

/** A live runtime registration; dispose on session shutdown or before re-registering. */
export interface VerifierRegistration {
  dispose(): void;
}

/** The registration attempt's outcome; the runner rides a success. */
export interface VerifierInstall {
  ok: boolean;
  /** The failure reason, when not ok. */
  error?: string;
  runner?: VerifierRunner;
  registration?: VerifierRegistration;
}

interface RegistrationRequest {
  version: 1;
  name: string;
  definition: {
    description: string;
    systemPrompt: string;
    tools: string[];
  };
  result?:
    | { ok: true; registration: VerifierRegistration }
    | { ok: false; error: Error };
}

/** The shipped verifier definition's frontmatter plus body. */
interface ShippedDefinition {
  description: string;
  systemPrompt: string;
  tools: string[];
}

/**
 * Read the shipped agent definition. The file is the one home of the
 * system prompt; a missing or empty definition is a registration
 * failure (naming the file), never a silent skip.
 */
function loadVerifierDefinition(): ShippedDefinition {
  const file = fileURLToPath(new URL("../../agents/reins-completion-verifier.md", import.meta.url));
  const text = readFileSync(file, "utf8");
  const split = splitFrontmatter(text);
  const parsed: unknown = split.frontmatterText !== null ? YAML.parse(split.frontmatterText) : {};
  const data = (parsed ?? {}) as Record<string, unknown>;
  const systemPrompt = split.body.trim();
  if (systemPrompt === "") {
    throw new Error("the shipped verifier definition (agents/reins-completion-verifier.md) has an empty system prompt");
  }
  return {
    description:
      typeof data.description === "string" && data.description.trim() !== ""
        ? data.description
        : `pi-reins ${VERIFIER_AGENT_NAME}`,
    systemPrompt,
    tools: Array.isArray(data.tools)
      ? data.tools.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

/**
 * Attempt the runtime agent registration. No user-visible effects:
 * the caller decides what absence means (the session_start reconcile
 * notifies only for a bound contract).
 */
export function registerCompletionVerifier(pi: { events?: EventBus }): VerifierInstall {
  try {
    const events = pi.events;
    if (events === undefined || typeof events.emit !== "function" || typeof events.on !== "function") {
      return { ok: false, error: "the pi runtime exposes no event bus" };
    }
    const request: RegistrationRequest = {
      version: 1,
      name: VERIFIER_AGENT_NAME,
      definition: loadVerifierDefinition(),
    };
    // Event delivery is synchronous: the owner writes the result
    // before emit returns; no result means no compatible owner.
    events.emit(RUNTIME_AGENT_REGISTER_EVENT, request);
    if (request.result === undefined) {
      return { ok: false, error: "pi-subagents is not installed or not ready in this session" };
    }
    if (request.result.ok === false) {
      return {
        ok: false,
        error: `pi-subagents refused the registration: ${request.result.error.message}`,
      };
    }
    return {
      ok: true,
      registration: request.result.registration,
      runner: createSubagentsVerifier(events),
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/**
 * The session_start install: dispose the previous registration, attempt
 * the registration, and remember the outcome on the state, failing
 * visibly when a contract is bound in the session (the attach record):
 * one error notification plus the widget marker. On success the wiring
 * swaps the runner (install.runner) and keeps the registration
 * (install.registration) for disposal at session shutdown.
 */
export function installCompletionVerifier(
  deps: ReinsDeps,
  pi: { events?: EventBus },
  previous: VerifierRegistration | undefined,
  state: ReinsState,
): { state: ReinsState; install: VerifierInstall } {
  previous?.dispose();
  const install = registerCompletionVerifier(pi);
  if (install.ok) return { state, install };

  const unavailable = `pi-subagents is unavailable: ${install.error}`;
  const bound =
    deps.session.readEntries?.().some((entry) => entry.customType === ATTACHED_ENTRY_TYPE) ?? false;
  if (!bound) return { state: { ...state, verifierUnavailable: unavailable }, install };

  // A bound contract will need verification: fail visibly now.
  deps.ui.notify(
    `reins: completion verification is unavailable (${unavailable}). ` +
      `Plan completion is verified by the fresh-context ${VERIFIER_AGENT_NAME} agent, run through ` +
      "pi-subagents; install pi-subagents (pi install npm:pi-subagents) and restart the session.",
    "error",
  );
  deps.ui.setWidget(WIDGET_KEY, [
    "Verifier: unavailable (pi-subagents missing)",
    "Completion is refused until pi-subagents is installed.",
  ]);
  return { state: { ...state, verifierUnavailable: unavailable }, install };
}

// The in-process event-bus RPC (pi-subagents v1): requests on the
// request event, replies on `reply:<requestId>`, async completion on
// the shared async-complete event.
const RPC_REQUEST_EVENT = "subagents:rpc:v1:request";
const RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";
const ASYNC_COMPLETE_EVENT = "subagent:async-complete";

/** An unattended verifier run should never hang the completion attempt forever. */
const VERIFIER_TIMEOUT_MS = 15 * 60 * 1000;

interface RpcReply<T> {
  success?: boolean;
  data?: T;
  error?: { message?: string };
}

/** One correlated RPC call over the event bus. */
function rpcRequest<T>(events: EventBus, method: string, params: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolveReply, rejectReply) => {
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      unsubscribe();
      rejectReply(new Error(`the pi-subagents ${method} request timed out`));
    }, VERIFIER_TIMEOUT_MS);
    const unsubscribe = events.on(`${RPC_REPLY_PREFIX}${requestId}`, (raw) => {
      clearTimeout(timer);
      const reply = (raw ?? {}) as RpcReply<T>;
      if (reply.success === true) resolveReply(reply.data as T);
      else rejectReply(new Error(reply.error?.message ?? `the pi-subagents ${method} request failed`));
    });
    events.emit(RPC_REQUEST_EVENT, {
      version: 1,
      requestId,
      method,
      params,
      source: { extension: "pi-reins" },
    });
  });
}

interface SpawnReply {
  id?: string;
  runId?: string;
}

interface AsyncComplete {
  id?: string;
  runId?: string;
  success?: boolean;
  state?: string;
}

interface StatusReply {
  text?: string;
}

/** Wait for the spawned run's completion event, correlated by run id. */
function waitForAsyncComplete(events: EventBus, runId: string): Promise<AsyncComplete> {
  return new Promise<AsyncComplete>((resolveComplete, rejectComplete) => {
    const timer = setTimeout(() => {
      unsubscribe();
      rejectComplete(new Error(`the ${VERIFIER_AGENT_NAME} run did not report completion`));
    }, VERIFIER_TIMEOUT_MS);
    const unsubscribe = events.on(ASYNC_COMPLETE_EVENT, (raw) => {
      const payload = (raw ?? {}) as AsyncComplete;
      if ((payload.runId ?? payload.id) !== runId) return;
      clearTimeout(timer);
      unsubscribe();
      resolveComplete(payload);
    });
  });
}

/**
 * Parse the verifier's final answer into the verdict. The agent is
 * instructed to answer `VERDICT: fulfilled` or `VERDICT: gaps` with
 * one named gap per `- ` line; anything else reads as gaps (the whole
 * answer becomes one unnamed gap when nothing parses).
 */
export function parseVerifierVerdict(text: string): VerifierResult {
  if (/VERDICT:\s*fulfilled/i.test(text)) return { fulfilled: true, gaps: [] };
  const gaps = text
    .split("\n")
    .map((line) => line.replace(/^\s*-\s+/, "").trim())
    .filter((line) => line !== "" && !/^VERDICT:/i.test(line));
  if (gaps.length > 0) return { fulfilled: false, gaps };
  const collapsed = text.replace(/\s+/g, " ").trim();
  return {
    fulfilled: false,
    gaps: [collapsed !== "" ? collapsed : "the verifier returned no named gaps"],
  };
}

/**
 * The real VerifierRunner over the in-process RPC spawn: a fresh,
 * async child run of the registered verifier agent, awaited through
 * the async-complete event, its final answer fetched via status.
 */
export function createSubagentsVerifier(events: EventBus): VerifierRunner {
  return {
    async run(request: VerifierRequest): Promise<VerifierResult> {
      const task = [
        "Judge whether this execution contract is fulfilled.",
        "",
        "Completion contract:",
        request.contract,
        "",
        "Change digest (plan log):",
        request.changeDigest,
      ].join("\n");
      const spawned = (await rpcRequest<SpawnReply>(events, "spawn", {
        agent: VERIFIER_AGENT_NAME,
        task,
        context: "fresh",
        async: true,
        cwd: process.cwd(),
      })) as SpawnReply;
      const runId = typeof spawned?.id === "string" ? spawned.id : spawned?.runId;
      if (runId === undefined) {
        throw new Error("the pi-subagents spawn reply carried no run id");
      }
      const completed = await waitForAsyncComplete(events, runId);
      if (completed.success === false || (completed.state !== undefined && completed.state !== "complete")) {
        throw new Error(
          `the ${VERIFIER_AGENT_NAME} run did not complete successfully (state: ${completed.state ?? "unknown"})`,
        );
      }
      const status = (await rpcRequest<StatusReply>(events, "status", { id: runId })) as StatusReply;
      return parseVerifierVerdict(typeof status?.text === "string" ? status.text : "");
    },
  };
}
