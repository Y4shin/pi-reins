---
type: Task
id: implement-change
title: Implement the provider-based loader
executionStatus: pending
expectedPathRegexes:
  - "^src/config/"
  - "^tests/config/"
---

# Task

## Description

Replace the static configuration loader with the provider-based
implementation agreed in the masterplan.

## Acceptance Criteria

- The focused configuration tests pass.
- The loader resolves values through the provider model.

## Constraints

- Preserve existing public behavior.
- Do not migrate callers as part of this task.
