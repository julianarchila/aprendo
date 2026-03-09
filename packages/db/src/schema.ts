export type QuestionAssetKind = 'image' | 'table' | 'graph' | 'passage'

export interface QuestionAsset {
  id: string
  kind: QuestionAssetKind
  label: string
  storagePath: string | null
}

export interface QuestionOption {
  id: string
  label: string
  text: string
  isCorrect: boolean
}

export interface Question {
  id: string
  sourceDocumentId: string
  topic: string
  statement: string
  options: QuestionOption[]
  assets: QuestionAsset[]
}

export const contentTables = [
  'source_documents',
  'questions',
  'question_options',
  'question_assets',
  'ingestion_runs',
] as const

export type ContentTableName = (typeof contentTables)[number]
