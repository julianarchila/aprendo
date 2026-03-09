# @aprendo/ingest

Placeholder OCR and content-ingestion boundary for Aprendo.

## Current status

This package does not perform real OCR or persistence yet. It exports typed dummy functions so we can lock the package boundary, CLI shape, and dependency direction before wiring Mistral OCR and database writes.

## Planned responsibility

- call Mistral OCR for source PDFs
- normalize OCR output into question records
- persist normalized questions through `@aprendo/db`
