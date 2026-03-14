import { internalMutation, query } from './_generated/server'
import { v } from 'convex/values'

const RECENT_WINDOW_SIZE = 5

type AttemptMetric = {
  isCorrect: boolean
  answeredAt: number
  responseTimeMs: number
  usedHint: boolean
  usedTutor: boolean
}

function calculateAccuracy(correctCount: number, attemptCount: number) {
  if (attemptCount === 0) return 0
  return correctCount / attemptCount
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function evidenceLevel(attemptCount: number) {
  if (attemptCount >= 6) return 'high'
  if (attemptCount >= 3) return 'medium'
  return 'low'
}

function masteryScore(metrics: {
  accuracy: number
  recentAccuracy: number
  hintRate: number
  tutorRate: number
  attemptCount: number
}) {
  const evidenceBoost = Math.min(metrics.attemptCount / 6, 1) * 0.05
  return Math.max(
    0,
    Math.min(
      1,
      metrics.recentAccuracy * 0.55
      + metrics.accuracy * 0.4
      + evidenceBoost
      - metrics.hintRate * 0.08
      - metrics.tutorRate * 0.04,
    ),
  )
}

function summarizeAttempts(attempts: AttemptMetric[]) {
  const sorted = [...attempts].sort((a, b) => a.answeredAt - b.answeredAt)
  const recent = sorted.slice(-RECENT_WINDOW_SIZE)
  const attemptCount = sorted.length
  const correctCount = sorted.filter((attempt) => attempt.isCorrect).length
  const recentAttemptCount = recent.length
  const recentCorrectCount = recent.filter((attempt) => attempt.isCorrect).length
  const avgResponseTimeMs = average(
    sorted
      .map((attempt) => attempt.responseTimeMs)
      .filter((value) => Number.isFinite(value) && value > 0),
  )
  const hintRate = calculateAccuracy(
    sorted.filter((attempt) => attempt.usedHint).length,
    attemptCount,
  )
  const tutorRate = calculateAccuracy(
    sorted.filter((attempt) => attempt.usedTutor).length,
    attemptCount,
  )
  const accuracy = calculateAccuracy(correctCount, attemptCount)
  const recentAccuracy = calculateAccuracy(recentCorrectCount, recentAttemptCount)
  const lastAttemptAt = sorted.at(-1)?.answeredAt

  return {
    attemptCount,
    correctCount,
    accuracy,
    recentAttemptCount,
    recentAccuracy,
    avgResponseTimeMs,
    hintRate,
    tutorRate,
    lastAttemptAt,
    masteryScore: masteryScore({
      accuracy,
      recentAccuracy,
      hintRate,
      tutorRate,
      attemptCount,
    }),
    evidenceLevel: evidenceLevel(attemptCount),
  }
}

export const rebuildStudentProgress = internalMutation({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    const attempts = await ctx.db
      .query('questionAttempts')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()

    const completedAttempts = attempts.filter(
      (attempt) => attempt.isCorrect != null && attempt.answeredAt != null,
    )
    const questionIds = [...new Set(completedAttempts.map((attempt) => attempt.questionId))]
    const questions = await Promise.all(questionIds.map((questionId) => ctx.db.get(questionId)))
    const questionById = new Map(
      questions
        .filter((question): question is NonNullable<typeof question> => question != null)
        .map((question) => [question._id, question]),
    )

    const subjectBuckets = new Map<string, AttemptMetric[]>()
    const subtopicBuckets = new Map<
      string,
      {
        subjectId: string
        categoryId: string
        subtopicId: string
        attempts: AttemptMetric[]
      }
    >()
    const overallAttempts: AttemptMetric[] = []

    for (const attempt of completedAttempts) {
      const question = questionById.get(attempt.questionId)
      if (
        question == null
        || question.subjectId == null
        || question.primarySubtopicId == null
        || question.categoryId == null
        || attempt.answeredAt == null
        || attempt.isCorrect == null
      ) {
        continue
      }

      const metric: AttemptMetric = {
        isCorrect: attempt.isCorrect,
        answeredAt: attempt.answeredAt,
        responseTimeMs: attempt.responseTimeMs ?? 0,
        usedHint: attempt.usedHint,
        usedTutor: attempt.usedTutor,
      }
      overallAttempts.push(metric)

      const subjectAttempts = subjectBuckets.get(question.subjectId) ?? []
      subjectAttempts.push(metric)
      subjectBuckets.set(question.subjectId, subjectAttempts)

      const subtopicKey = `${question.subjectId}::${question.primarySubtopicId}`
      const subtopicEntry = subtopicBuckets.get(subtopicKey) ?? {
        subjectId: question.subjectId,
        categoryId: question.categoryId,
        subtopicId: question.primarySubtopicId,
        attempts: [],
      }
      subtopicEntry.attempts.push(metric)
      subtopicBuckets.set(subtopicKey, subtopicEntry)
    }

    const existingSubjectAggregates = await ctx.db
      .query('learnerSubjectAggregates')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()
    for (const aggregate of existingSubjectAggregates) {
      await ctx.db.delete(aggregate._id)
    }

    const existingSubtopicAggregates = await ctx.db
      .query('learnerSubtopicAggregates')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()
    for (const aggregate of existingSubtopicAggregates) {
      await ctx.db.delete(aggregate._id)
    }

    const now = Date.now()
    const subjectSummaries = [...subjectBuckets.entries()].map(([subjectId, metrics]) => ({
      subjectId,
      ...summarizeAttempts(metrics),
    }))
    for (const summary of subjectSummaries) {
      await ctx.db.insert('learnerSubjectAggregates', {
        studentId: args.studentId,
        subjectId: summary.subjectId,
        attemptCount: summary.attemptCount,
        correctCount: summary.correctCount,
        accuracy: summary.accuracy,
        recentAttemptCount: summary.recentAttemptCount,
        recentAccuracy: summary.recentAccuracy,
        avgResponseTimeMs: summary.avgResponseTimeMs,
        hintRate: summary.hintRate,
        tutorRate: summary.tutorRate,
        lastAttemptAt: summary.lastAttemptAt,
        masteryScore: summary.masteryScore,
        evidenceLevel: summary.evidenceLevel,
        updatedAt: now,
      })
    }

    const subtopicSummaries = [...subtopicBuckets.values()].map((entry) => ({
      subjectId: entry.subjectId,
      categoryId: entry.categoryId,
      subtopicId: entry.subtopicId,
      ...summarizeAttempts(entry.attempts),
    }))
    for (const summary of subtopicSummaries) {
      await ctx.db.insert('learnerSubtopicAggregates', {
        studentId: args.studentId,
        subjectId: summary.subjectId,
        categoryId: summary.categoryId,
        subtopicId: summary.subtopicId,
        attemptCount: summary.attemptCount,
        correctCount: summary.correctCount,
        accuracy: summary.accuracy,
        recentAttemptCount: summary.recentAttemptCount,
        recentAccuracy: summary.recentAccuracy,
        avgResponseTimeMs: summary.avgResponseTimeMs,
        hintRate: summary.hintRate,
        tutorRate: summary.tutorRate,
        lastAttemptAt: summary.lastAttemptAt,
        masteryScore: summary.masteryScore,
        evidenceLevel: summary.evidenceLevel,
        updatedAt: now,
      })
    }

    const existingSnapshot = await ctx.db
      .query('learnerProfileSnapshots')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .unique()
    if (existingSnapshot) {
      await ctx.db.delete(existingSnapshot._id)
    }

    const overallSummary = summarizeAttempts(overallAttempts)
    const strongestSubjectIds = [...subjectSummaries]
      .sort((a, b) => b.masteryScore - a.masteryScore)
      .slice(0, 3)
      .map((summary) => summary.subjectId)
    const weakestSubjectIds = [...subjectSummaries]
      .sort((a, b) => a.masteryScore - b.masteryScore)
      .slice(0, 3)
      .map((summary) => summary.subjectId)
    const weakestSubtopicIds = [...subtopicSummaries]
      .sort((a, b) => a.masteryScore - b.masteryScore)
      .slice(0, 5)
      .map((summary) => summary.subtopicId)

    const completedDiagnosticSessions = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_type', (q) =>
        q.eq('studentId', args.studentId).eq('type', 'diagnostic'),
      )
      .collect()
    const latestDiagnostic = completedDiagnosticSessions
      .filter((session) => session.status === 'completed' && session.summary != null)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]

    await ctx.db.insert('learnerProfileSnapshots', {
      studentId: args.studentId,
      updatedAt: now,
      strongestSubjectIds,
      weakestSubjectIds,
      weakestSubtopicIds,
      diagnosticBaseline: latestDiagnostic?.summary,
      overallSummary: {
        correctCount: overallSummary.correctCount,
        answeredCount: overallSummary.attemptCount,
        questionCount: overallSummary.attemptCount,
        accuracy: overallSummary.accuracy,
        durationMs: Math.round(overallSummary.avgResponseTimeMs * overallSummary.attemptCount),
      },
    })
  },
})

export const getStudentProgress = query({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db
      .query('learnerProfileSnapshots')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .unique()
    const subjectAggregates = await ctx.db
      .query('learnerSubjectAggregates')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()
    const subtopicAggregates = await ctx.db
      .query('learnerSubtopicAggregates')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()

    return {
      snapshot,
      subjectAggregates: subjectAggregates.sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
      weakestSubtopics: [...subtopicAggregates]
        .sort((a, b) => a.masteryScore - b.masteryScore)
        .slice(0, 8),
    }
  },
})
