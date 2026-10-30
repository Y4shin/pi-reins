/**
 * The tool_call guard: raw edit, write, and shell writes into the plan
 * directory are blocked pre-execution whenever a contract is bound,
 * with a reason naming the plugin tools that own task state. Task
 * lifecycle changes go through the reins_* tools; this guard is what
 * makes them the only write path.
 *
 * Shell inspection is best-effort: redirection targets, the file
 * arguments of the usual write commands, and `dd of=` are treated as
 * write targets. Reads never block, and writes outside the plan
 * directory never block. A second leg rides the same surface: the
 * expected-declaration observer nudges (never blocks) on writes and
 * commands outside the active tasks' declared lists; plan-editing
 * later inverts the guard to also block writes outside the plan
 * directory. Raw writes into the plan directory stay blocked in every
 * bound state.
 */

import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";

import type { ReinsDeps } from "../deps.js";
import { discoverPlanDir } from "../plan/discover.js";
import type { TaskDocument } from "../plan/parse.js";
import type { ReinsState } from "../state.js";
import { STEERED_PHASES } from "../steering/engine.js";

/** The bound contract the guard protects; nothing is blocked without one. */
export interface GuardedContract {
  /** The plan directory (absolute), set once a contract is attached. */
  planDir?: string;
}

/** Shell commands whose positional arguments are all write targets. */
const ALL_ARGS_WRITE_COMMANDS = new Set([
  "tee",
  "touch",
  "mkdir",
  "rmdir",
  "rm",
  "unlink",
  "truncate",
  "shred",
  "mkfifo",
  "patch",
  "split",
  "csplit",
  // PowerShell cmdlets (best-effort; compared lowercased).
  "out-file",
  "set-content",
  "add-content",
  "new-item",
  "remove-item",
]);

/** Shell commands whose last positional argument is the write target. */
const LAST_ARG_WRITE_COMMANDS = new Set(["cp", "mv", "ln", "install", "rsync", "copy-item", "move-item"]);

/** Command words that just wrap the real command. */
const PREFIX_COMMANDS = new Set(["sudo", "nohup", "command", "exec", "time", "env"]);

/** The refusal the model sees; it names the plugin tools that own the plan directory. */
function refusalReason(target: string): string {
  return (
    `Blocked raw write into the plan directory ("${target}"): the plan directory is owned by ` +
    "pi-reins. Task state changes go through the plugin tools: reins_task_start, " +
    "reins_task_complete, reins_task_block, reins_progress."
  );
}

/** Whether a raw path resolves inside the plan directory. */
function resolvesInside(target: string, cwd: string, planDir: string): boolean {
  const absolute = isAbsolute(target) ? resolve(target) : resolve(cwd, target);
  const rel = relative(planDir, absolute);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * The raw write targets a tool_call event addresses, best-effort:
 * edit/write path arguments and shell write targets (redirections and
 * the file arguments of write commands). Custom tools, reads, and
 * non-shell events yield no targets here.
 */
export function rawWriteTargets(event: ToolCallEvent): string[] {
  const input = event.input as Record<string, unknown>;
  if (event.toolName === "edit" || event.toolName === "write") {
    return typeof input.path === "string" ? [input.path] : [];
  }
  if (event.toolName === "bash" || event.toolName === "powershell") {
    return typeof input.command === "string" ? shellWriteTargets(input.command) : [];
  }
  return [];
}

/** Tokenize one shell command into quoted-stripped words. */
function tokenize(segment: string): string[] {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((token) =>
    token.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"),
  );
}

/**
 * Best-effort shell write targets: redirection operands anywhere in the
 * command, the positional arguments of the usual write commands (all of
 * them for rm/touch/tee and friends, the last for cp/mv and friends,
 * sed only with -i), and `dd of=`. Quoting, cd, and process
 * substitution are not modeled; the guard errs toward blocking.
 */
export function shellWriteTargets(command: string): string[] {
  const targets: string[] = [];
  const push = (target: string | undefined): void => {
    if (target === undefined || target === "" || target.startsWith("&") || target.startsWith("(")) return;
    targets.push(target);
  };

  for (const segment of command.split(/\|\||&&|\||;|\n/)) {
    const tokens = tokenize(segment);

    // Redirections: standalone operator tokens and attached operands.
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === ">" || token === ">>" || /^\d*>>?$/.test(token) || /^&>>?$/.test(token)) {
        push(tokens[i + 1]);
        continue;
      }
      const attached = token.match(/^(?:\d*&?|&)?(>>?)((?![>=&])[^\s]+)$/);
      if (attached) push(attached[2]);
      const of = token.match(/^of=(.+)$/);
      if (of) push(of[1]);
    }

    // Write commands: unwrap prefixes and env assignments, then treat
    // positional arguments as targets per the command's shape.
    let start = 0;
    while (
      start < tokens.length &&
      (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[start]) || PREFIX_COMMANDS.has(tokens[start]))
    ) {
      start++;
    }
    const word = (tokens[start] ?? "").split("/").pop()?.toLowerCase() ?? "";
    const args = tokens.slice(start + 1).filter((arg) => !arg.startsWith("-"));
    if (ALL_ARGS_WRITE_COMMANDS.has(word)) {
      for (const arg of args) push(arg);
    } else if (LAST_ARG_WRITE_COMMANDS.has(word) && args.length > 0) {
      push(args[args.length - 1]);
    } else if (word === "sed" && tokens.slice(start + 1).some((arg) => arg === "-i" || /^-i\S/.test(arg))) {
      for (const arg of args) push(arg);
    }
  }
  return targets;
}

/**
 * The tool_call handler leg that blocks raw writes into the plan
 * directory. Returns a block decision with a reason naming the plugin
 * tools, or undefined to let the call proceed.
 */
export function guardPlanDirWrites(
  event: ToolCallEvent,
  ctx: { cwd: string },
  contract: GuardedContract,
): ToolCallEventResult | undefined {
  if (contract.planDir === undefined) return undefined;
  const planDir = resolve(contract.planDir);
  for (const target of rawWriteTargets(event)) {
    if (resolvesInside(target, ctx.cwd, planDir)) {
      return { block: true, reason: refusalReason(target) };
    }
  }
  return undefined;
}

/** Inputs the expected-declaration observer needs, built by the wiring. */
export interface ExpectedDeclarationIo {
  /** Live ephemeral state, re-read per event. */
  state: () => ReinsState;
  /** Deps factory; the wiring roots the fs port at the attached plan directory. */
  deps: (ctx: unknown) => ReinsDeps;
}

/** Valid compiled regexes from a declared frontmatter list. */
function declaredRegexes(value: unknown): RegExp[] {
  if (!Array.isArray(value)) return [];
  const patterns: RegExp[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "") continue;
    try {
      patterns.push(new RegExp(entry));
    } catch {
      // An unusable declared pattern is skipped, never a crash: the
      // lists are advisory and under-declaring them is normal.
    }
  }
  return patterns;
}

function taskIdOf(task: TaskDocument): string {
  return String(task.frontmatter.id ?? task.file);
}

/** The raw shell command line of a shell tool_call event, if any. */
function shellCommandOf(event: ToolCallEvent): string | undefined {
  if (event.toolName !== "bash" && event.toolName !== "powershell") return undefined;
  const input = event.input as Record<string, unknown>;
  const command = input.command;
  return typeof command === "string" && command.trim() !== "" ? command : undefined;
}

/**
 * The expected-declaration observation leg: advisory steering only.
 *
 * A write target matching none of the active tasks' declared
 * expectedPathRegexes, or a shell command matching none of their
 * declared expectedBashRegexes, queues a forced steering injection
 * naming the deviation. The call always proceeds; the declared lists
 * are expectation, never permission. Tasks without the fields, and
 * fields no active task declares, trigger nothing. Blocked calls (the
 * guard's decision above) are not observed: the block reason is the
 * targeted feedback there.
 */
export function observeExpectedDeclarations(
  event: ToolCallEvent,
  ctx: unknown,
  io: ExpectedDeclarationIo,
): void {
  const state = io.state();
  if (state.planDir === undefined || !STEERED_PHASES.includes(state.phase)) return;
  const deps = io.deps(ctx);
  const scan = discoverPlanDir(deps.fs, state.planDir);
  const active = scan.tasks.filter((task) => task.frontmatter.executionStatus === "in_progress");
  if (active.length === 0) return;

  const pathRegexes = active.flatMap((task) => declaredRegexes(task.frontmatter.expectedPathRegexes));
  const bashRegexes = active.flatMap((task) => declaredRegexes(task.frontmatter.expectedBashRegexes));
  const who =
    active.length === 1
      ? `active task ${taskIdOf(active[0])}`
      : `active tasks ${active.map(taskIdOf).join(", ")}`;

  const deviations: string[] = [];
  for (const target of rawWriteTargets(event)) {
    if (!pathRegexes.some((regex) => regex.test(target))) {
      deviations.push(`wrote "${target}", which matches no expectedPathRegexes of the ${who}`);
    }
  }
  const command = shellCommandOf(event);
  if (
    command !== undefined &&
    bashRegexes.length > 0 &&
    !bashRegexes.some((regex) => regex.test(command))
  ) {
    deviations.push(`ran "${command}", which matches no expectedBashRegexes of the ${who}`);
  }
  if (deviations.length > 0) {
    deps.steering.forceInject("expected-declaration", deviations.join("; "));
  }
}
