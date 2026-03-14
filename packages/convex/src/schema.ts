import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  learnerAggregateValidator,
  pdfUploadStatusValidator,
  questionAttemptValidator,
  questionDocumentValidator,
  selectionReasonValidator,
  sessionDocumentValidator,
  studentSummaryValidator,
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
      enrichmentStartedAt: v.optional(v.number()),
      enrichedAt: v.optional(v.number()),
      ocrPagesStorageId: v.optional(v.id('_storage')),
      rawQuestionsStorageId: v.optional(v.id('_storage')),
      answerCompletedCount: v.optional(v.number()),
      taxonomyCompletedCount: v.optional(v.number()),
      diagnosticEligibleCount: v.optional(v.number()),
      excludedQuestionCount: v.optional(v.number()),
    })
      .index('by_createdAt', ['createdAt'])
      .index('by_slug', ['slug'])
      .index('by_status', ['status']),
    questions: defineTable(questionDocumentValidator)
      .index('by_pdfUploadId', ['pdfUploadId'])
      .index('by_pdfUploadId_questionNumber', ['pdfUploadId', 'questionNumber'])
      .index('by_pdfUploadId_sequence', ['pdfUploadId', 'sequence'])
      .index('by_pdfUploadId_eligibility', ['pdfUploadId', 'eligibility'])
      .index('by_subjectId_eligibility', ['subjectId', 'eligibility'])
      .index('by_primarySubtopicId_eligibility', ['primarySubtopicId', 'eligibility']),
    students: defineTable({
      email: v.string(),
      normalizedEmail: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastSeenAt: v.number(),
    })
      .index('by_normalizedEmail', ['normalizedEmail'])
      .index('by_createdAt', ['createdAt']),
    sessions: defineTable(sessionDocumentValidator)
      .index('by_studentId', ['studentId'])
      .index('by_studentId_type', ['studentId', 'type'])
      .index('by_studentId_status', ['studentId', 'status'])
      .index('by_studentId_type_status', ['studentId', 'type', 'status'])
      .index('by_studentId_startedAt', ['studentId', 'startedAt']),
    sessionQuestions: defineTable({
      sessionId: v.id('sessions'),
      questionId: v.id('questions'),
      position: v.number(),
      selectionReason: selectionReasonValidator,
      selectionMetadata: v.optional(v.string()),
    })
      .index('by_sessionId', ['sessionId'])
      .index('by_sessionId_position', ['sessionId', 'position']),
    questionAttempts: defineTable(questionAttemptValidator)
      .index('by_studentId', ['studentId'])
      .index('by_sessionId', ['sessionId'])
      .index('by_studentId_sessionId', ['studentId', 'sessionId'])
      .index('by_sessionQuestionId', ['sessionQuestionId'])
      .index('by_studentId_questionId', ['studentId', 'questionId']),
    learnerSubjectAggregates: defineTable(learnerAggregateValidator)
      .index('by_studentId', ['studentId'])
      .index('by_studentId_subjectId', ['studentId', 'subjectId']),
    learnerSubtopicAggregates: defineTable(learnerAggregateValidator)
      .index('by_studentId', ['studentId'])
      .index('by_studentId_subtopicId', ['studentId', 'subtopicId'])
      .index('by_studentId_subjectId', ['studentId', 'subjectId']),
    learnerProfileSnapshots: defineTable({
      studentId: v.id('students'),
      updatedAt: v.number(),
      strongestSubjectIds: v.array(v.string()),
      weakestSubjectIds: v.array(v.string()),
      weakestSubtopicIds: v.array(v.string()),
      diagnosticBaseline: v.optional(studentSummaryValidator),
      overallSummary: studentSummaryValidator,
    }).index('by_studentId', ['studentId']),
  },
  { schemaValidation: true },
)
