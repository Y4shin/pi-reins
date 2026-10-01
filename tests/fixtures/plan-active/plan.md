---
type: Execution Plan
id: config-migration
title: Configuration loading migration
description: Execution plan for moving configuration loading onto the provider model.
schemaVersion: 1
goal: Migrate configuration loading to the new provider model
executionStatus: active
revision: 1
sources:
  - id: masterplan
    resource: ../grill-me/config-migration-masterplan.md
    title: Config migration masterplan
---

# Configuration loading migration

This execution plan migrates configuration loading to the provider-based
model agreed with the user. The masterplan settled the target
architecture and interface; this contract covers getting there while
preserving existing behavior. The legacy loading mechanism is the main
risk area.
