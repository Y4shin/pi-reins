---
type: changelog
title: Task Changelog
---
# Task Changelog

## 2026-10-01, Task lifecycle tools with write-path enforcement (task-lifecycle)
The five reins task tools (start with resume semantics, complete with
required summary, block with required reason, status, progress with
append-only progressLog) are the only write path into task state; a
tool_call guard blocks raw edit, write, and shell writes into the plan
directory in every bound state, naming the plugin tool; the widget
gained Active, Now, and counts lines. Landed the contractStatus
remaining-work listing and the guard's write-target exports tickets 7,
10, and 11 build on. Gate: typecheck clean, 71/71 tests.

## 2026-10-01, User-controlled plan activation (activation)
`/reins-activate` previews the plan (goal plus task summary) and on
confirmation flips executionStatus to active, ensures the Creation
entry then appends the Activation entry, writes the first human-actor
verified event, enters executing, and renders the minimal widget;
without an interactive UI it blocks fail-closed through `requireUi`.
Landed the acceptance write utilities (`prependLogEntry`,
`appendVerifiedEvent`) plan-editing-review reuses, and settled the
actor resolution pass-down. Gate: typecheck clean, 53/53 tests
including the live inert-load check.

## 2026-10-01, Attach-time validation of the execution-plan contract (attach-validation)
`validatePlan` returns every violation `{ file, rule, message }` with
rule classes composed via a `RULE_CHECKS` extension point (reserved
filename and unknown subheading rules surface as discovery/parse
findings), and the `/reins-attach <path>` command binds on pass,
refuses with a complete report otherwise, and never writes into the
plan directory. Gate: typecheck clean, 44/44 tests including the live
inert-load check.

## 2026-10-01, Package scaffold, test harness, and plan-directory IO (scaffold-plan-io)
pi-reins package scaffold landed: a pi extension with importable DI
handlers under a thin registration shell, the synthetic-event test
harness (scripted dialogs, captured UI calls, recorder ports, temp
plan dirs), the plan-directory IO module (discover, parse with
binding-section extraction, findings never crashes, generated-stamped
writes), and the plan-valid plus malformed fixture family. Gate:
typecheck clean, 24/24 tests, live inert-load verified against the
real pi CLI (0.84.4).
