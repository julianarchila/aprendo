export * from './client'
export * from './migrations'
export * from './schema'

import type { Question } from './schema'

const placeholderQuestions: Question[] = [
  {
    id: 'q-reading-001',
    sourceDocumentId: 'doc-placeholder-2024',
    topic: 'Critical reading',
    statement:
      'Placeholder ICFES-style question used to validate package boundaries.',
    options: [
      { id: 'a', label: 'A', text: 'Option A', isCorrect: false },
      { id: 'b', label: 'B', text: 'Option B', isCorrect: true },
      { id: 'c', label: 'C', text: 'Option C', isCorrect: false },
      { id: 'd', label: 'D', text: 'Option D', isCorrect: false },
    ],
    assets: [
      {
        id: 'asset-graph-001',
        kind: 'graph',
        label: 'Placeholder graph reference',
        storagePath: null,
      },
    ],
  },
]

export function listQuestions(): Question[] {
  return placeholderQuestions
}
