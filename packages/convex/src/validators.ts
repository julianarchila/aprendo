import { v } from 'convex/values'

export const pdfUploadStatusValidator = v.union(
  v.literal('uploaded'),
  v.literal('processing'),
  v.literal('enriching'),
  v.literal('completed'),
  v.literal('failed'),
)

export const questionOptionValidator = v.object({
  label: v.string(),
  bodyMarkdown: v.string(),
})

export const processingStatusValidator = v.union(
  v.literal('pending'),
  v.literal('processing'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('needs_review'),
)

export const questionEligibilityValidator = v.union(
  v.literal('pending'),
  v.literal('diagnostic'),
  v.literal('practice_only'),
  v.literal('excluded'),
)

export const secondaryDimensionValidator = v.object({
  dimension: v.string(),
  value: v.string(),
})

export const questionDocumentValidator = v.object({
  pdfUploadId: v.id('pdfUploads'),
  questionNumber: v.number(),
  sequence: v.number(),
  bodyMarkdown: v.string(),
  options: v.array(questionOptionValidator),
  createdAt: v.number(),
  answerStatus: v.optional(processingStatusValidator),
  answerCorrectOption: v.optional(v.string()),
  answerSolutionMarkdown: v.optional(v.string()),
  answerConfidence: v.optional(v.number()),
  answerModelId: v.optional(v.string()),
  answerPromptVersion: v.optional(v.string()),
  answerCompletedAt: v.optional(v.number()),
  answerErrorMessage: v.optional(v.string()),
  taxonomyStatus: v.optional(processingStatusValidator),
  taxonomyVersion: v.optional(v.string()),
  taxonomyRelease: v.optional(v.string()),
  subjectId: v.optional(v.string()),
  categoryId: v.optional(v.string()),
  primarySubtopicId: v.optional(v.string()),
  secondarySubtopicIds: v.optional(v.array(v.string())),
  secondaryDimensions: v.optional(v.array(secondaryDimensionValidator)),
  taggingConfidence: v.optional(v.number()),
  taxonomyModelId: v.optional(v.string()),
  taxonomyPromptVersion: v.optional(v.string()),
  taxonomyCompletedAt: v.optional(v.number()),
  taxonomyErrorMessage: v.optional(v.string()),
  eligibility: v.optional(questionEligibilityValidator),
  eligibilityReasons: v.optional(v.array(v.string())),
  eligibilityEvaluatedAt: v.optional(v.number()),
})

export const sessionTypeValidator = v.union(
  v.literal('diagnostic'),
  v.literal('practice'),
  v.literal('review'),
)

export const sessionStatusValidator = v.union(
  v.literal('created'),
  v.literal('in_progress'),
  v.literal('completed'),
  v.literal('abandoned'),
)

export const selectionReasonValidator = v.union(
  v.literal('balanced_diagnostic'),
  v.literal('weak_subtopic'),
  v.literal('recent_mistake'),
  v.literal('reinforcement'),
  v.literal('confidence_building'),
)

export const recommendationSourceValidator = v.union(
  v.literal('diagnostic_plan'),
  v.literal('rule_based'),
  v.literal('review_mistakes'),
  v.literal('manual'),
)

export const studentSummaryValidator = v.object({
  correctCount: v.number(),
  answeredCount: v.number(),
  questionCount: v.number(),
  accuracy: v.number(),
  durationMs: v.number(),
})

export const sessionDocumentValidator = v.object({
  studentId: v.id('students'),
  type: sessionTypeValidator,
  status: sessionStatusValidator,
  recommendationSource: recommendationSourceValidator,
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  questionCount: v.number(),
  currentPosition: v.number(),
  summary: v.optional(studentSummaryValidator),
})

export const questionAttemptValidator = v.object({
  studentId: v.id('students'),
  sessionId: v.id('sessions'),
  questionId: v.id('questions'),
  sessionQuestionId: v.id('sessionQuestions'),
  attemptType: sessionTypeValidator,
  selectedOption: v.optional(v.string()),
  isCorrect: v.optional(v.boolean()),
  answeredAt: v.optional(v.number()),
  responseTimeMs: v.optional(v.number()),
  usedHint: v.boolean(),
  usedTutor: v.boolean(),
  hintCount: v.number(),
  tutorMessageCount: v.number(),
  wasSkipped: v.boolean(),
})

export const learnerAggregateValidator = v.object({
  studentId: v.id('students'),
  subjectId: v.string(),
  categoryId: v.optional(v.string()),
  subtopicId: v.optional(v.string()),
  attemptCount: v.number(),
  correctCount: v.number(),
  accuracy: v.number(),
  recentAttemptCount: v.number(),
  recentAccuracy: v.number(),
  avgResponseTimeMs: v.number(),
  hintRate: v.number(),
  tutorRate: v.number(),
  lastAttemptAt: v.optional(v.number()),
  masteryScore: v.number(),
  evidenceLevel: v.string(),
  updatedAt: v.number(),
})
