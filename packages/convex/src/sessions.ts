import { internal } from './_generated/api'
import { mutation, query, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import taxonomyContract from '../../../docs/taxonomy.v1.json'
import {
  getSessionKindConfig,
  type QuestionEligibilityPool,
  type SessionKind,
  type SessionKindConfig,
} from './sessionKinds'
import { sessionKindValidator } from './validators'

const SUBJECT_IDS = taxonomyContract.subjects.map((subject) => subject.id)

type SelectionReason =
  | 'balanced_diagnostic'
  | 'balanced_coverage'
  | 'weak_subtopic'
  | 'recent_mistake'
  | 'reinforcement'
  | 'confidence_building'
  | 'topic_focus'

type Selection = {
  questionId: Id<'questions'>
  selectionReason: SelectionReason
  selectionMetadata: string
}

function stableQuestionOrder<T extends { _creationTime: number; sequence: number }>(questions: T[]) {
  return [...questions].sort((a, b) => {
    if (a._creationTime !== b._creationTime) {
      return a._creationTime - b._creationTime
    }
    return a.sequence - b.sequence
  })
}

/** A question is usable only if it has a scored answer key and full taxonomy. */
function hasUsableMetadata(question: Doc<'questions'>) {
  return (
    question.answerCorrectOption != null
    && question.subjectId != null
    && question.categoryId != null
    && question.primarySubtopicId != null
  )
}

function isInEligibilityPool(question: Doc<'questions'>, pools: QuestionEligibilityPool[]) {
  return question.eligibility != null
    && (pools as string[]).includes(question.eligibility)
}

async function hasCompletedDiagnostic(ctx: QueryCtx, studentId: Id<'students'>) {
  const diagnostics = await ctx.db
    .query('sessions')
    .withIndex('by_studentId_kind', (q) => q.eq('studentId', studentId).eq('kind', 'diagnostic'))
    .collect()
  return diagnostics.some((session) => session.status === 'completed')
}

function recommendationSourceForKind(kind: SessionKind) {
  switch (kind) {
    case 'diagnostic':
      return 'diagnostic_plan' as const
    case 'topic':
      return 'manual' as const
    default:
      return 'rule_based' as const
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Selection strategies — each returns an ordered list of question selections.
// ─────────────────────────────────────────────────────────────────────────

/** Even spread across all five subjects (diagnostic, simulacro). */
async function selectBalancedBySubject(
  ctx: QueryCtx,
  config: SessionKindConfig,
): Promise<Selection[]> {
  const perSubject = config.questionsPerSubject ?? 4
  const reason: SelectionReason =
    config.kind === 'diagnostic' ? 'balanced_diagnostic' : 'balanced_coverage'
  const selected: Selection[] = []

  for (const subjectId of SUBJECT_IDS) {
    const pooled: Doc<'questions'>[] = []
    for (const pool of config.eligibilityPools) {
      const rows = await ctx.db
        .query('questions')
        .withIndex('by_subjectId_eligibility', (q) =>
          q.eq('subjectId', subjectId).eq('eligibility', pool),
        )
        .collect()
      pooled.push(...rows)
    }
    const usable = stableQuestionOrder(pooled.filter(hasUsableMetadata)).slice(0, perSubject)
    for (const question of usable) {
      selected.push({ questionId: question._id, selectionReason: reason, selectionMetadata: subjectId })
    }
  }

  return selected
}

/** Heavily concentrated in a single requested subject (topic practice). */
async function selectTopic(
  ctx: QueryCtx,
  config: SessionKindConfig,
  studentId: Id<'students'>,
  subjectId: string,
): Promise<Selection[]> {
  const total = config.totalQuestions ?? 10

  const pooled: Doc<'questions'>[] = []
  for (const pool of config.eligibilityPools) {
    const rows = await ctx.db
      .query('questions')
      .withIndex('by_subjectId_eligibility', (q) =>
        q.eq('subjectId', subjectId).eq('eligibility', pool),
      )
      .collect()
    pooled.push(...rows)
  }
  const usable = stableQuestionOrder(pooled.filter(hasUsableMetadata))

  const attempts = await ctx.db
    .query('questionAttempts')
    .withIndex('by_studentId', (q) => q.eq('studentId', studentId))
    .collect()
  const seen = new Set(attempts.map((attempt) => attempt.questionId))

  // Prefer unseen questions, then fall back to already-seen ones to fill.
  const unseen = usable.filter((question) => !seen.has(question._id))
  const seenOnly = usable.filter((question) => seen.has(question._id))
  const ordered = [...unseen, ...seenOnly].slice(0, total)

  return ordered.map((question) => ({
    questionId: question._id,
    selectionReason: 'topic_focus' as const,
    selectionMetadata: subjectId,
  }))
}

/** Rule-based selection targeting weak areas (recommended practice). */
async function selectRecommended(
  ctx: QueryCtx,
  config: SessionKindConfig,
  studentId: Id<'students'>,
): Promise<Selection[]> {
  const total = config.totalQuestions ?? 10

  const attempts = await ctx.db
    .query('questionAttempts')
    .withIndex('by_studentId', (q) => q.eq('studentId', studentId))
    .collect()
  const attemptedQuestionIds = new Set(attempts.map((attempt) => attempt.questionId))

  const allQuestions = await ctx.db.query('questions').collect()
  const eligibleQuestions = stableQuestionOrder(
    allQuestions.filter(
      (question) =>
        isInEligibilityPool(question, config.eligibilityPools)
        && hasUsableMetadata(question)
        && !attemptedQuestionIds.has(question._id),
    ),
  )

  const subtopicAggregates = await ctx.db
    .query('learnerSubtopicAggregates')
    .withIndex('by_studentId', (q) => q.eq('studentId', studentId))
    .collect()
  const subjectAggregates = await ctx.db
    .query('learnerSubjectAggregates')
    .withIndex('by_studentId', (q) => q.eq('studentId', studentId))
    .collect()

  const selected: Selection[] = []
  const selectedIds = new Set<Id<'questions'>>()

  const fill = (
    candidates: Doc<'questions'>[],
    selectionReason: SelectionReason,
    selectionMetadata: string,
  ) => {
    for (const question of stableQuestionOrder(candidates)) {
      if (selected.length >= total) return
      if (selectedIds.has(question._id)) continue
      selected.push({ questionId: question._id, selectionReason, selectionMetadata })
      selectedIds.add(question._id)
    }
  }

  // 1. Weakest subtopics first.
  for (const aggregate of [...subtopicAggregates].sort((a, b) => a.masteryScore - b.masteryScore)) {
    fill(
      eligibleQuestions.filter((question) => question.primarySubtopicId === aggregate.subtopicId),
      'weak_subtopic',
      aggregate.subtopicId ?? aggregate.subjectId,
    )
  }

  // 2. Reinforcement from the medium-strength subjects.
  const subjectsByAscendingMastery = [...subjectAggregates]
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .map((aggregate) => aggregate.subjectId)
  const reinforcementSubjectIds = subjectsByAscendingMastery.length > 2
    ? subjectsByAscendingMastery.slice(1, -1)
    : subjectsByAscendingMastery
  for (const subjectId of reinforcementSubjectIds) {
    fill(
      eligibleQuestions.filter((question) => question.subjectId === subjectId),
      'reinforcement',
      subjectId,
    )
  }

  // 3. Confidence building from the strongest subjects.
  const subjectsByDescendingMastery = [...subjectAggregates]
    .sort((a, b) => b.masteryScore - a.masteryScore)
    .map((aggregate) => aggregate.subjectId)
  for (const subjectId of subjectsByDescendingMastery) {
    fill(
      eligibleQuestions.filter((question) => question.subjectId === subjectId),
      'confidence_building',
      subjectId,
    )
  }

  // 4. Fallback pool to guarantee a full session.
  fill(eligibleQuestions, 'confidence_building', 'fallback_pool')

  return selected
}

async function buildSelection(
  ctx: QueryCtx,
  config: SessionKindConfig,
  studentId: Id<'students'>,
  subjectId: string | undefined,
): Promise<Selection[]> {
  switch (config.strategy) {
    case 'balanced_by_subject':
      return selectBalancedBySubject(ctx, config)
    case 'topic':
      if (subjectId == null) throw new Error('Topic practice requires a subject.')
      return selectTopic(ctx, config, studentId, subjectId)
    case 'recommended':
      return selectRecommended(ctx, config, studentId)
    default:
      return []
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Mutations / queries
// ─────────────────────────────────────────────────────────────────────────

export const createSession = mutation({
  args: {
    studentId: v.id('students'),
    kind: sessionKindValidator,
    subjectId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = getSessionKindConfig(args.kind)

    if (config.requiresDiagnostic && !(await hasCompletedDiagnostic(ctx, args.studentId))) {
      throw new Error('Completa el diagnóstico antes de iniciar esta práctica.')
    }

    if (config.requiresSubject) {
      if (args.subjectId == null || !SUBJECT_IDS.includes(args.subjectId)) {
        throw new Error('Selecciona una asignatura válida para esta práctica.')
      }
    }

    // Reuse an in-progress session of the same kind (and subject, for topic
    // practice) instead of starting a duplicate.
    const active = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_kind_status', (q) =>
        q.eq('studentId', args.studentId).eq('kind', args.kind).eq('status', 'in_progress'),
      )
      .collect()
    const reusable = active.find(
      (session) => args.kind !== 'topic' || session.subjectId === args.subjectId,
    )
    if (reusable) {
      return reusable._id
    }

    const selected = await buildSelection(ctx, config, args.studentId, args.subjectId)
    if (selected.length === 0) {
      throw new Error('No hay preguntas disponibles para esta práctica.')
    }

    const now = Date.now()
    const sessionId = await ctx.db.insert('sessions', {
      studentId: args.studentId,
      kind: args.kind,
      status: 'in_progress',
      recommendationSource: recommendationSourceForKind(args.kind),
      subjectId: config.requiresSubject ? args.subjectId : undefined,
      startedAt: now,
      timeLimitMs: config.timeLimitMs ?? undefined,
      expiresAt: config.timeLimitMs != null ? now + config.timeLimitMs : undefined,
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

export const getActiveSession = query({
  args: {
    studentId: v.id('students'),
    kind: v.optional(sessionKindValidator),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()
    return sessions
      .filter((session) => session.status === 'in_progress' || session.status === 'created')
      .filter((session) => args.kind == null || session.kind === args.kind)
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  },
})

export const listSessions = query({
  args: {
    studentId: v.id('students'),
    kind: v.optional(sessionKindValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_studentId', (q) => q.eq('studentId', args.studentId))
      .collect()

    return sessions
      .filter((session) => args.kind == null || session.kind === args.kind)
      // The diagnostic gate is an onboarding step, not part of the practice
      // history students browse.
      .filter((session) => session.kind !== 'diagnostic')
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, args.limit ?? 50)
  },
})

export const getLatestDiagnostic = query({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_kind', (q) =>
        q.eq('studentId', args.studentId).eq('kind', 'diagnostic'),
      )
      .collect()

    return sessions
      .filter((session) => session.status === 'completed')
      .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt))[0] ?? null
  },
})

export const getSession = query({
  args: {
    sessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null) return null

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

    // Answers and explanations are only disclosed once the session is complete.
    const canReviewAnswers = session.status === 'completed'

    return {
      session,
      questions: sessionQuestions
        .map((sessionQuestion, index) => {
          const question = questions[index]
          if (question == null) return null
          const displayQuestion = canReviewAnswers
            ? question
            : {
                ...question,
                answerCorrectOption: undefined,
                answerSolutionMarkdown: undefined,
              }

          return {
            sessionQuestionId: sessionQuestion._id,
            position: sessionQuestion.position,
            selectionReason: sessionQuestion.selectionReason,
            selectionMetadata: sessionQuestion.selectionMetadata ?? null,
            question: displayQuestion,
            attempt: attemptBySessionQuestionId.get(sessionQuestion._id) ?? null,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item != null),
    }
  },
})

export const submitAnswer = mutation({
  args: {
    sessionId: v.id('sessions'),
    sessionQuestionId: v.id('sessionQuestions'),
    selectedOption: v.string(),
    responseTimeMs: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null) {
      throw new Error('Sesión no encontrada.')
    }
    if (session.status === 'completed' || session.status === 'abandoned') {
      throw new Error('La sesión ya no está activa.')
    }

    const sessionQuestion = await ctx.db.get(args.sessionQuestionId)
    if (sessionQuestion == null || sessionQuestion.sessionId !== args.sessionId) {
      throw new Error('Pregunta de la sesión no encontrada.')
    }

    const question = await ctx.db.get(sessionQuestion.questionId)
    if (question == null || question.answerCorrectOption == null) {
      throw new Error('La respuesta correcta no está disponible.')
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
        attemptType: session.kind,
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

    return { answered: true }
  },
})

export const clearAnswer = mutation({
  args: {
    sessionId: v.id('sessions'),
    sessionQuestionId: v.id('sessionQuestions'),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null) {
      throw new Error('Sesión no encontrada.')
    }
    if (session.status !== 'in_progress' && session.status !== 'created') {
      throw new Error('La sesión no está activa.')
    }

    const sessionQuestion = await ctx.db.get(args.sessionQuestionId)
    if (sessionQuestion == null || sessionQuestion.sessionId !== args.sessionId) {
      throw new Error('Pregunta de la sesión no encontrada.')
    }

    const existing = await ctx.db
      .query('questionAttempts')
      .withIndex('by_sessionQuestionId', (q) => q.eq('sessionQuestionId', args.sessionQuestionId))
      .unique()
    if (existing == null) {
      return { cleared: true }
    }

    await ctx.db.delete(existing._id)
    return { cleared: true }
  },
})

export const completeSession = mutation({
  args: {
    sessionId: v.id('sessions'),
    // Set when the client completes the session because the timer expired.
    expired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session == null) {
      throw new Error('Sesión no encontrada.')
    }
    if (session.status === 'completed') {
      return summarize(session)
    }

    const attempts = await ctx.db
      .query('questionAttempts')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', args.sessionId))
      .collect()
    const answeredAttempts = attempts.filter((attempt) => attempt.isCorrect != null)
    const correctCount = answeredAttempts.filter((attempt) => attempt.isCorrect).length
    const answeredCount = answeredAttempts.length
    const completedAt = Date.now()
    const rawDurationMs = completedAt - session.startedAt
    // For timed sessions, never report a duration beyond the allotted limit.
    const durationMs = session.timeLimitMs != null
      ? Math.min(rawDurationMs, session.timeLimitMs)
      : rawDurationMs

    const summary = {
      correctCount,
      answeredCount,
      questionCount: session.questionCount,
      accuracy: session.questionCount === 0 ? 0 : correctCount / session.questionCount,
      durationMs,
    }

    await ctx.db.patch(args.sessionId, {
      status: 'completed',
      completedAt,
      currentPosition: session.questionCount,
      summary,
    })

    await ctx.runMutation(internal.progress.rebuildStudentProgress, {
      studentId: session.studentId,
    })

    return { sessionId: args.sessionId, ...summary }
  },
})

function summarize(session: Doc<'sessions'>) {
  return {
    sessionId: session._id,
    correctCount: session.summary?.correctCount ?? 0,
    answeredCount: session.summary?.answeredCount ?? 0,
    questionCount: session.questionCount,
    accuracy: session.summary?.accuracy ?? 0,
    durationMs: session.summary?.durationMs ?? 0,
  }
}
