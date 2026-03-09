import { getDb, listQuestions } from '@aprendo/db'
import { extractPdfWithMistral } from './mistral'
import { normalizeOcrOutput } from './normalize'

export interface RunIngestResult {
  inputPath: string
  databaseStatus: string
  placeholderQuestionCount: number
  normalizedQuestionCount: number
}

export async function runIngest(
  inputPath = 'data/source.pdf',
): Promise<RunIngestResult> {
  const extraction = await extractPdfWithMistral(inputPath)
  const normalized = normalizeOcrOutput(extraction)
  const db = getDb()

  return {
    inputPath,
    databaseStatus: db.status,
    placeholderQuestionCount: listQuestions().length,
    normalizedQuestionCount: normalized.questions.length,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runIngest(process.argv[2])
  console.log(
    `[ingest] ${result.inputPath} -> ${result.normalizedQuestionCount} normalized placeholder question(s)`,
  )
}
