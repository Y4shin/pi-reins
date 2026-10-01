---
type: Task
id: verify-result
title: Verify the result
executionStatus: pending
expectedBashRegexes:
  - "^npm (install|run|test)"
  - "^git (add|commit|status)"
---

# Task

## Description

Confirm the migrated loader preserves existing behavior end to end.

## Acceptance Criteria

- The full test suite passes.
- A before-and-after comparison of loaded values is recorded in the completion summary.

## Constraints

- No new dependencies.
