export interface DbClient {
  provider: 'postgres'
  status: 'placeholder'
  connectionString: string
}

export function getDb() {
  return {
    provider: 'postgres',
    status: 'placeholder',
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/aprendo',
  } satisfies DbClient
}
