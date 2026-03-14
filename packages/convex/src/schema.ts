import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  pdfUploadStatusValidator,
  questionDocumentValidator,
} from './validators'

export default defineSchema(
  {
    pdfUploads: defineTable({
      fileName: v.string(),
      slug: v.string(),
      pdfStorageId: v.id('_storage'),
      contentType: v.string(),
      sizeBytes: v.number(),
      status: pdfUploadStatusValidator,
      createdAt: v.number(),
      updatedAt: v.number(),
      errorMessage: v.optional(v.string()),
      pageCount: v.optional(v.number()),
      assetCount: v.optional(v.number()),
      questionCount: v.optional(v.number()),
      processingStartedAt: v.optional(v.number()),
      processedAt: v.optional(v.number()),
      ocrPagesStorageId: v.optional(v.id('_storage')),
      rawQuestionsStorageId: v.optional(v.id('_storage')),
    })
      .index('by_createdAt', ['createdAt'])
      .index('by_slug', ['slug'])
      .index('by_status', ['status']),
    questions: defineTable(questionDocumentValidator)
      .index('by_pdfUploadId', ['pdfUploadId'])
      .index('by_pdfUploadId_questionNumber', ['pdfUploadId', 'questionNumber'])
      .index('by_pdfUploadId_sequence', ['pdfUploadId', 'sequence']),
  },
  { schemaValidation: true },
)
