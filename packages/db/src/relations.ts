import { defineRelations } from 'drizzle-orm'
import * as schema from './schema'

export const relations = defineRelations(schema, (r) => ({
  sourceDocuments: {
    questions: r.many.questions({
      from: r.sourceDocuments.id,
      to: r.questions.sourceDocumentId,
    }),
  },
  questions: {
    sourceDocument: r.one.sourceDocuments({
      from: r.questions.sourceDocumentId,
      to: r.sourceDocuments.id,
      optional: false,
    }),
    options: r.many.questionOptions({
      from: r.questions.id,
      to: r.questionOptions.questionId,
    }),
    assets: r.many.questionAssets({
      from: r.questions.id,
      to: r.questionAssets.questionId,
    }),
  },
  questionOptions: {
    question: r.one.questions({
      from: r.questionOptions.questionId,
      to: r.questions.id,
      optional: false,
    }),
    assets: r.many.questionAssets({
      from: r.questionOptions.id,
      to: r.questionAssets.optionId,
    }),
  },
  questionAssets: {
    question: r.one.questions({
      from: r.questionAssets.questionId,
      to: r.questions.id,
      optional: false,
    }),
    option: r.one.questionOptions({
      from: r.questionAssets.optionId,
      to: r.questionOptions.id,
    }),
  },
}))
