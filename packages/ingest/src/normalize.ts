import type { Question } from '@aprendo/db'
import type { OcrExtraction } from './mistral'

export interface NormalizedIngestResult {
  sourceDocumentId: string
  questions: Question[]
}

export function normalizeOcrOutput(
  extraction: OcrExtraction,
): NormalizedIngestResult {
  return {
    sourceDocumentId: 'doc-normalized-placeholder',
    questions: [
      {
        id: 'normalized-question-001',
        sourceDocumentId: 'doc-normalized-placeholder',
        topic: 'Mathematics',
        statement: `Normalized placeholder generated from: ${extraction.markdown}`,
        options: [
          { id: 'a', label: 'A', text: 'Placeholder option A', isCorrect: false },
          { id: 'b', label: 'B', text: 'Placeholder option B', isCorrect: true },
          { id: 'c', label: 'C', text: 'Placeholder option C', isCorrect: false },
          { id: 'd', label: 'D', text: 'Placeholder option D', isCorrect: false },
        ],
        assets: [],
      },
    ],
  }
}
