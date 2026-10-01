---
type: Change Proposal
id: cp-add-cli-migration
kind: add
title: Migrate the CLI flags
---

# Change Proposal: Migrate the CLI flags

## Rationale

The current plan no longer suffices because the goal also covers the
command-line interface, and no task addresses it.

## Proposed task (draft)

id: migrate-cli-flags
title: Migrate the CLI flags

## Description

Migrate the CLI flag parsing onto the provider model.

## Acceptance Criteria

- The focused CLI tests pass.

## Constraints

- Preserve existing flag names.
