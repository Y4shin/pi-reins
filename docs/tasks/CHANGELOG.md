---
type: changelog
title: Task Changelog
---
# Task Changelog

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
