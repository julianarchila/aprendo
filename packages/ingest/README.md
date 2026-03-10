# @aprendo/ingest

Placeholder OCR and content-ingestion boundary for Aprendo.

## Current status

This package does not perform real OCR or persistence yet. It exports typed dummy functions so we can lock the package boundary, CLI shape, and dependency direction before wiring Mistral OCR and database writes.

## Planned responsibility

- call Mistral OCR for source PDFs
- normalize OCR output into question records
- persist normalized questions through `@aprendo/db`

## Sample OCR spike

Run the sample PDF spike with:

```sh
bun run ocr:sample
```

This reads `packages/ingest/.env`, calls Mistral OCR for
`data/pdfs/Matemáticas2010.pdf`, and writes the raw OCR response plus one
Markdown note per page under
`packages/ingest/.artifacts/mistral-ocr/matematicas2010/`.
