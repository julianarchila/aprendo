export interface MigrationResult {
  status: 'skipped'
  reason: string
}

export async function runMigrations(): Promise<MigrationResult> {
  return {
    status: 'skipped',
    reason: 'Database migrations are placeholders in the initial scaffold.',
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runMigrations()
  console.log(`[db:migrate] ${result.status}: ${result.reason}`)
}
