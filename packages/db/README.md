# @aprendo/db

Shared database boundary for Aprendo.

## Current status

This package now contains the first-pass Drizzle schema for the question bank domain.

## Planned responsibility

- own Drizzle schema and migrations
- expose server-side database utilities
- centralize shared content-domain types

## Current schema

- `source_documents`
- `questions`
- `question_options`
- `question_assets`

The schema is intentionally simple:

- each question is fully self-contained
- shared context is duplicated into each question row
- assets belong directly to a question, and optionally to one of its options
- asset bytes are expected to live outside Postgres, with Postgres storing metadata and a stable `storage_key`
