# Aprendo

Lean monorepo scaffold for an AI-assisted ICFES preparation platform.

## What is here

- `apps/web`: TanStack Start web app with a landing page, dummy auth screen, and placeholder dashboard
- `packages/db`: shared data access package with typed placeholder content models
- `packages/ingest`: placeholder OCR/import package for future PDF ingestion with Mistral OCR
- `data`: gitignored workspace for PDFs and generated OCR artifacts

## Stack

- `pnpm` workspaces
- `turbo` for task orchestration
- TanStack Start for the student-facing web app
- TypeScript across the workspace
- Local PostgreSQL via Docker Compose

## Repo layout

```text
apps/
  web/
packages/
  db/
  ingest/
data/
docker-compose.yml
package.json
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
```

## Local setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

3. Copy environment variables if needed:

   ```bash
   cp .env.example .env
   ```

4. Start the web app:

   ```bash
   pnpm dev
   ```

## Workspace commands

- `pnpm dev`: run the TanStack Start app through Turbo
- `pnpm build`: build or compile-check all workspace packages
- `pnpm typecheck`: run TypeScript checks across the monorepo
- `pnpm test`: run placeholder test commands
- `pnpm db:migrate`: execute the placeholder database migration entrypoint
- `pnpm ingest`: execute the placeholder ingestion CLI

## Current boundaries

### `@aprendo/db`

Owns shared content types and future database integration. Today it exports typed dummy functions so the web app and ingestion package can depend on a stable interface.

### `@aprendo/ingest`

Owns future PDF extraction, OCR normalization, and persistence orchestration. Today it only returns placeholder values and demonstrates the intended dependency on `@aprendo/db`.

### `@aprendo/web`

Owns the initial student-facing experience. It already imports placeholder data through a server-only module, but does not implement real auth, OCR uploads, or adaptive learning yet.

## Near-term roadmap

1. Replace placeholder content models with Drizzle schema definitions and migrations.
2. Wire Mistral OCR into the ingestion package and persist normalized questions.
3. Add real student authentication and a proper diagnostic flow.
4. Introduce progress tracking and recommendation logic after content ingestion is stable.
