---
type: Context
title: Background and constraints
description: Why this migration exists and what constrains it.
---

# Context

The current configuration loading path reads a static file at startup
and hands the values to every consumer directly. The provider model
agreed in the masterplan replaces the static read with a resolution
step that can be tested in isolation.

The migration must preserve the exact values consumers see today.
