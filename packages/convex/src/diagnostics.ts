import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import taxonomyContract from '../../../docs/taxonomy.v1.json'

const DIAGNOSTIC_SUBJECT_IDS = taxonomyContract.subjects.map((subject) => subject.id)
const QUESTIONS_PER_SUBJECT = 4

function stableQuestionOrder<T extends { _creationTime: number; sequence: number }>(questions: T[]) {
  return [...questions].sort((a, b) => {
    if (a._creationTime !== b._creationTime) {
      return a._creationTime - b._creationTime
    }
    return a.sequence - b.sequence
  })
}

export const createOrGetDiagnosticSession = mutation({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_type_status', (q) =>
        q.eq('studentId', args.studentId).eq('type', 'diagnostic').eq('status', 'in_progress'),
      )
      .first()

    if (existing) {
      return existing._id
    }

    const created = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_type_status', (q) =>
        q.eq('studentId', args.studentId).eq('type', 'diagnostic').eq('status', 'created'),
      )
      .first()

    if (created) {
      await ctx.db.patch(created._id, {
        status: 'in_progress',
      })
      return created._id
    }

    const selectedQuestionIds: Array<{ questionId: Id<'questions'>; subjectId: string }> = []
    const subjectPoolStats: Array<{
      subjectId: string
      availableCount: number
      selectedCount: number
    }> = []
    for (const subjectId of DIAGNOSTIC_SUBJECT_IDS) {
      const subjectQuestions = await ctx.db
        .query('questions')
        .withIndex('by_subjectId_eligibility', (q) =>
          q.eq('subjectId', subjectId).eq('eligibility', 'diagnostic'),
        )
        .collect()

      const chosen = stableQuestionOrder(subjectQuestions).slice(0, QUESTIONS_PER_SUBJECT)
      subjectPoolStats.push({
        subjectId,
        availableCount: subjectQuestions.length,
        selectedCount: chosen.length,
      })
      for (const question of chosen) {
        selectedQuestionIds.push({
          questionId: question._id,
          subjectId,
        })
      }
    }

    if (selectedQuestionIds.length < DIAGNOSTIC_SUBJECT_IDS.length * QUESTIONS_PER_SUBJECT) {
      const missingSubjects = subjectPoolStats.filter(
        (subject) => subject.selectedCount < QUESTIONS_PER_SUBJECT,
      )
      console.error('[diagnostics.createOrGetDiagnosticSession] insufficient diagnostic pool', {
        studentId: args.studentId,
        requiredQuestionsPerSubject: QUESTIONS_PER_SUBJECT,
        totalSelected: selectedQuestionIds.length,
        totalRequired: DIAGNOSTIC_SUBJECT_IDS.length * QUESTIONS_PER_SUBJECT,
        subjectPoolStats,
      })
      throw new Error(
        [
          'Not enough diagnostic-ready questions to build the first diagnostic exam.',
          `Required ${QUESTIONS_PER_SUBJECT} per subject.`,
          `Short subjects: ${missingSubjects.map((subject) => `${subject.subjectId} (${subject.availableCount})`).join(', ')}`,
        ].join(' '),
      )
    }

    const now = Date.now()
    const sessionId = await ctx.db.insert('sessions', {
      studentId: args.studentId,
      type: 'diagnostic',
      status: 'in_progress',
      recommendationSource: 'diagnostic_plan',
      startedAt: now,
      questionCount: selectedQuestionIds.length,
      currentPosition: 1,
    })

    let position = 1
    for (const item of selectedQuestionIds) {
      await ctx.db.insert('sessionQuestions', {
        sessionId,
        questionId: item.questionId,
        position,
        selectionReason: 'balanced_diagnostic',
        selectionMetadata: item.subjectId,
      })
      position += 1
    }

    return sessionId
  },
})

export const getDiagnosticSession = query({
  args: {
    sessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null || session.type !== 'diagnostic') {
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
            question,
            attempt: attemptBySessionQuestionId.get(sessionQuestion._id) ?? null,
          }
        })
        .filter((
          question,
        ): question is {
          sessionQuestionId: Id<'sessionQuestions'>
          position: number
          question: NonNullable<(typeof questions)[number]>
          attempt: (typeof attempts)[number] | null
        } => question != null),
    }
  },
})

export const submitDiagnosticAnswer = mutation({
  args: {
    sessionId: v.id('sessions'),
    sessionQuestionId: v.id('sessionQuestions'),
    selectedOption: v.string(),
    responseTimeMs: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null || session.type !== 'diagnostic') {
      throw new Error('Diagnostic session not found.')
    }

    const sessionQuestion = await ctx.db.get(args.sessionQuestionId)
    if (sessionQuestion == null || sessionQuestion.sessionId !== args.sessionId) {
      throw new Error('Diagnostic question not found.')
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
        attemptType: 'diagnostic',
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
    }
  },
})

export const completeDiagnosticSession = mutation({
  args: {
    sessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null || session.type !== 'diagnostic') {
      throw new Error('Diagnostic session not found.')
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

export const getStudentLatestDiagnostic = query({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_type', (q) =>
        q.eq('studentId', args.studentId).eq('type', 'diagnostic'),
      )
      .collect()

    return sessions.sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt))[0] ?? null
  },
})
