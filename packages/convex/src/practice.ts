import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'

const PRACTICE_SESSION_SIZE = 10

function stableQuestionOrder<T extends { _creationTime: number; sequence: number }>(questions: T[]) {
  return [...questions].sort((a, b) => {
    if (a._creationTime !== b._creationTime) {
      return a._creationTime - b._creationTime
    }
    return a.sequence - b.sequence
  })
}

function isPracticeEligibleQuestion(question: Doc<'questions'>) {
  return (
    (question.eligibility === 'diagnostic' || question.eligibility === 'practice_only')
    && question.answerCorrectOption != null
    && question.subjectId != null
    && question.categoryId != null
    && question.primarySubtopicId != null
  )
}

function insertQuestionSelection(
  args: {
    selected: Array<{
      questionId: Id<'questions'>
      selectionReason: 'weak_subtopic' | 'reinforcement' | 'confidence_building'
      selectionMetadata: string
    }>
    selectedIds: Set<Id<'questions'>>
    questions: Doc<'questions'>[]
    selectionReason: 'weak_subtopic' | 'reinforcement' | 'confidence_building'
    selectionMetadata: string
  },
) {
  for (const question of stableQuestionOrder(args.questions)) {
    if (args.selected.length >= PRACTICE_SESSION_SIZE) return
    if (args.selectedIds.has(question._id)) continue

    args.selected.push({
      questionId: question._id,
      selectionReason: args.selectionReason,
      selectionMetadata: args.selectionMetadata,
    })
    args.selectedIds.add(question._id)
  }
}

export const createOrGetPracticeSession = mutation({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    const completedDiagnostic = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_type', (q) =>
        q.eq('studentId', args.studentId).eq('type', 'diagnostic'),
      )
      .collect()

    const hasCompletedDiagnostic = completedDiagnostic.some(
      (session) => session.status === 'completed',
    )
    if (!hasCompletedDiagnostic) {
      throw new Error('Complete the diagnostic before starting practice.')
    }

    const existing = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_type_status', (q) =>
        q.eq('studentId', args.studentId).eq('type', 'practice').eq('status', 'in_progress'),
      )
      .first()
    if (existing) {
      return existing._id
    }

    const created = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_type_status', (q) =>
        q.eq('studentId', args.studentId).eq('type', 'practice').eq('status', 'created'),
      )
      .first()
    if (created) {
      await ctx.db.patch(created._id, {
        status: 'in_progress',
      })
      return created._id
    }

    const attempts = await ctx.db
      .query('questionAttempts')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()
    const attemptedQuestionIds = new Set(attempts.map((attempt) => attempt.questionId))

    const allQuestions = await ctx.db.query('questions').collect()
    const eligibleQuestions = stableQuestionOrder(
      allQuestions.filter(
        (question) => isPracticeEligibleQuestion(question) && !attemptedQuestionIds.has(question._id),
      ),
    )

    if (eligibleQuestions.length === 0) {
      throw new Error('No eligible unseen practice questions are available.')
    }

    const weakestSubtopics = await ctx.db
      .query('learnerSubtopicAggregates')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()
    const subjectAggregates = await ctx.db
      .query('learnerSubjectAggregates')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()

    const selected: Array<{
      questionId: Id<'questions'>
      selectionReason: 'weak_subtopic' | 'reinforcement' | 'confidence_building'
      selectionMetadata: string
    }> = []
    const selectedIds = new Set<Id<'questions'>>()

    for (const aggregate of [...weakestSubtopics].sort((a, b) => a.masteryScore - b.masteryScore)) {
      const subtopicQuestions = eligibleQuestions.filter(
        (question) => question.primarySubtopicId === aggregate.subtopicId,
      )
      insertQuestionSelection({
        selected,
        selectedIds,
        questions: subtopicQuestions,
        selectionReason: 'weak_subtopic',
        selectionMetadata: aggregate.subtopicId ?? aggregate.subjectId,
      })
    }

    const subjectIdsByAscendingMastery = [...subjectAggregates]
      .sort((a, b) => a.masteryScore - b.masteryScore)
      .map((aggregate) => aggregate.subjectId)
    const reinforcementSubjectIds = subjectIdsByAscendingMastery.length > 2
      ? subjectIdsByAscendingMastery.slice(1, -1)
      : subjectIdsByAscendingMastery

    for (const subjectId of reinforcementSubjectIds) {
      const subjectQuestions = eligibleQuestions.filter((question) => question.subjectId === subjectId)
      insertQuestionSelection({
        selected,
        selectedIds,
        questions: subjectQuestions,
        selectionReason: 'reinforcement',
        selectionMetadata: subjectId,
      })
    }

    const subjectIdsByDescendingMastery = [...subjectAggregates]
      .sort((a, b) => b.masteryScore - a.masteryScore)
      .map((aggregate) => aggregate.subjectId)

    for (const subjectId of subjectIdsByDescendingMastery) {
      const subjectQuestions = eligibleQuestions.filter((question) => question.subjectId === subjectId)
      insertQuestionSelection({
        selected,
        selectedIds,
        questions: subjectQuestions,
        selectionReason: 'confidence_building',
        selectionMetadata: subjectId,
      })
    }

    insertQuestionSelection({
      selected,
      selectedIds,
      questions: eligibleQuestions,
      selectionReason: 'confidence_building',
      selectionMetadata: 'fallback_pool',
    })

    const now = Date.now()
    const sessionId = await ctx.db.insert('sessions', {
      studentId: args.studentId,
      type: 'practice',
      status: 'in_progress',
      recommendationSource: 'rule_based',
      startedAt: now,
      questionCount: selected.length,
      currentPosition: 1,
    })

    let position = 1
    for (const item of selected) {
      await ctx.db.insert('sessionQuestions', {
        sessionId,
        questionId: item.questionId,
        position,
        selectionReason: item.selectionReason,
        selectionMetadata: item.selectionMetadata,
      })
      position += 1
    }

    return sessionId
  },
})

export const getPracticeSession = query({
  args: {
    sessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null || session.type !== 'practice') {
      return null
    }

    const sessionQuestions = await ctx.db
      .query('sessionQuestions')
      .withIndex('by_sessionId_position', (q) => q.eq('sessionId', args.sessionId))
      .collect()
    const attempts = await ctx.db
      .query('questionAttempts')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', args.sessionId))
      .collect()
    const attemptBySessionQuestionId = new Map(
      attempts.map((attempt) => [attempt.sessionQuestionId, attempt]),
    )

    const questions = await Promise.all(
      sessionQuestions.map((sessionQuestion) => ctx.db.get(sessionQuestion.questionId)),
    )

    return {
      session,
      questions: sessionQuestions
        .map((sessionQuestion, index) => {
          const question = questions[index]
          if (question == null) return null

          return {
            sessionQuestionId: sessionQuestion._id,
            position: sessionQuestion.position,
            selectionReason: sessionQuestion.selectionReason,
            selectionMetadata: sessionQuestion.selectionMetadata ?? null,
            question,
            attempt: attemptBySessionQuestionId.get(sessionQuestion._id) ?? null,
          }
        })
        .filter((
          question,
        ): question is {
          sessionQuestionId: Id<'sessionQuestions'>
          position: number
          selectionReason: 'weak_subtopic' | 'reinforcement' | 'confidence_building' | 'balanced_diagnostic' | 'recent_mistake'
          selectionMetadata: string | null
          question: NonNullable<(typeof questions)[number]>
          attempt: (typeof attempts)[number] | null
        } => question != null),
    }
  },
})

export const submitPracticeAnswer = mutation({
  args: {
    sessionId: v.id('sessions'),
    sessionQuestionId: v.id('sessionQuestions'),
    selectedOption: v.string(),
    responseTimeMs: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null || session.type !== 'practice') {
      throw new Error('Practice session not found.')
    }

    const sessionQuestion = await ctx.db.get(args.sessionQuestionId)
    if (sessionQuestion == null || sessionQuestion.sessionId !== args.sessionId) {
      throw new Error('Practice question not found.')
    }

    const question = await ctx.db.get(sessionQuestion.questionId)
    if (question == null || question.answerCorrectOption == null) {
      throw new Error('Question answer key is not available.')
    }

    const existing = await ctx.db
      .query('questionAttempts')
      .withIndex('by_sessionQuestionId', (q) => q.eq('sessionQuestionId', args.sessionQuestionId))
      .unique()
    const now = Date.now()
    const isCorrect = args.selectedOption === question.answerCorrectOption

    if (existing) {
      await ctx.db.patch(existing._id, {
        selectedOption: args.selectedOption,
        isCorrect,
        answeredAt: now,
        responseTimeMs: args.responseTimeMs,
        wasSkipped: false,
      })
    } else {
      await ctx.db.insert('questionAttempts', {
        studentId: session.studentId,
        sessionId: session._id,
        questionId: question._id,
        sessionQuestionId: sessionQuestion._id,
        attemptType: 'practice',
        selectedOption: args.selectedOption,
        isCorrect,
        answeredAt: now,
        responseTimeMs: args.responseTimeMs,
        usedHint: false,
        usedTutor: false,
        hintCount: 0,
        tutorMessageCount: 0,
        wasSkipped: false,
      })
    }

    await ctx.db.patch(session._id, {
      currentPosition: Math.min(session.questionCount, sessionQuestion.position + 1),
    })

    return {
      isCorrect,
      correctOption: question.answerCorrectOption,
      explanation: question.answerSolutionMarkdown ?? null,
    }
  },
})

export const completePracticeSession = mutation({
  args: {
    sessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null || session.type !== 'practice') {
      throw new Error('Practice session not found.')
    }

    const attempts = await ctx.db
      .query('questionAttempts')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', args.sessionId))
      .collect()
    const answeredAttempts = attempts.filter((attempt) => attempt.isCorrect != null)
    const correctCount = answeredAttempts.filter((attempt) => attempt.isCorrect).length
    const answeredCount = answeredAttempts.length
    const completedAt = Date.now()
    const durationMs = completedAt - session.startedAt

    await ctx.db.patch(args.sessionId, {
      status: 'completed',
      completedAt,
      currentPosition: session.questionCount,
      summary: {
        correctCount,
        answeredCount,
        questionCount: session.questionCount,
        accuracy: session.questionCount === 0 ? 0 : correctCount / session.questionCount,
        durationMs,
      },
    })

    await ctx.runMutation(internal.progress.rebuildStudentProgress, {
      studentId: session.studentId,
    })

    return {
      sessionId: args.sessionId,
      correctCount,
      answeredCount,
      questionCount: session.questionCount,
      accuracy: session.questionCount === 0 ? 0 : correctCount / session.questionCount,
      durationMs,
    }
  },
})
