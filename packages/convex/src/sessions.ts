import { internal } from './_generated/api'
import { mutation, query, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { SUBJECT_IDS, getSubjectIdForSubtopic } from './taxonomy'
import {
  getSimulacroSubjectTargets,
  getSessionKindConfig,
  type QuestionEligibilityPool,
  type SessionKind,
  type SessionKindConfig,
  type SimulacroSessionConfig,
  type SubjectQuestionTarget,
} from './sessionKinds'
import {
  collectUsableQuestionsBySubject,
  collectUsableQuestionsBySubtopic,
  hasUsableMetadata,
  isInEligibilityPool,
} from './questionPool'
import { sessionKindValidator } from './validators'

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
    case 'repaso':
      return 'review_mistakes' as const
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
    const pooled = await collectUsableQuestionsBySubject(ctx, subjectId, config.eligibilityPools)
    const usable = stableQuestionOrder(pooled).slice(0, perSubject)
    for (const question of usable) {
      selected.push({ questionId: question._id, selectionReason: reason, selectionMetadata: subjectId })
    }
  }

  return selected
}

async function selectSubjectTargets(
  ctx: QueryCtx,
  config: SessionKindConfig,
  subjectTargets: SubjectQuestionTarget[],
  reason: SelectionReason,
): Promise<Selection[]> {
  const selected: Selection[] = []

  for (const target of subjectTargets) {
    const pooled = await collectUsableQuestionsBySubject(ctx, target.subjectId, config.eligibilityPools)
    const usable = stableQuestionOrder(pooled).slice(0, target.questionCount)
    for (const question of usable) {
      selected.push({
        questionId: question._id,
        selectionReason: reason,
        selectionMetadata: target.subjectId,
      })
    }
  }

  return selected
}

function getSimulacroSessionConfig(
  config: SessionKindConfig,
  sessionNumber: number | undefined,
): SimulacroSessionConfig {
  const sessions = config.simulacroSessions ?? []
  const targetSessionNumber = sessionNumber ?? 1
  const simulacroSession = sessions.find(
    (candidate) => candidate.sessionNumber === targetSessionNumber,
  )
  if (simulacroSession == null) {
    throw new Error('Selecciona una sesión válida del simulacro.')
  }
  return simulacroSession
}

function getSessionTimeLimitMs(
  config: SessionKindConfig,
  simulacroSessionNumber: number | undefined,
) {
  if (config.kind !== 'simulacro') return config.timeLimitMs
  return getSimulacroSessionConfig(config, simulacroSessionNumber).timeLimitMs
}

/**
 * Concentrated in a single requested subject (topic practice). When a
 * `subtopicId` is given (topic practice launched from the syllabus) the pool is
 * narrowed to that subtopic via the `by_primarySubtopicId_eligibility` index.
 */
async function selectTopic(
  ctx: QueryCtx,
  config: SessionKindConfig,
  studentId: Id<'students'>,
  subjectId: string,
  subtopicId: string | undefined,
): Promise<Selection[]> {
  const total = config.totalQuestions ?? 10

  const pooled = subtopicId != null
    ? await collectUsableQuestionsBySubtopic(ctx, subtopicId, config.eligibilityPools)
    : await collectUsableQuestionsBySubject(ctx, subjectId, config.eligibilityPools)
  const usable = stableQuestionOrder(pooled)

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
    selectionMetadata: subtopicId ?? subjectId,
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

/**
 * The questions due for spaced review: those whose most recent attempt was
 * incorrect (still "unlearned"), oldest mistakes first so the most overdue
 * resurface. Returns the ordered list of due question ids.
 */
/**
 * Launchable review questions for a student: those whose latest attempt was
 * wrong AND that are still usable + in one of the given eligibility pools,
 * oldest miss first. This is the single definition of "due for review" — both
 * the `getReviewQueue` count and the `repaso` session selection draw from it, so
 * the "Hoy" card can never advertise more review questions than a session can
 * actually launch (the same invariant `questionPool` enforces for the syllabus).
 */
async function collectDueReviewQuestions(
  ctx: QueryCtx,
  studentId: Id<'students'>,
  eligibilityPools: QuestionEligibilityPool[],
): Promise<Doc<'questions'>[]> {
  const attempts = await ctx.db
    .query('questionAttempts')
    .withIndex('by_studentId', (q) => q.eq('studentId', studentId))
    .collect()

  const latestByQuestion = new Map<Id<'questions'>, { isCorrect: boolean; answeredAt: number }>()
  for (const attempt of attempts) {
    if (attempt.answeredAt == null || attempt.isCorrect == null) continue
    const previous = latestByQuestion.get(attempt.questionId)
    if (previous == null || attempt.answeredAt > previous.answeredAt) {
      latestByQuestion.set(attempt.questionId, {
        isCorrect: attempt.isCorrect,
        answeredAt: attempt.answeredAt,
      })
    }
  }

  const dueQuestionIds = [...latestByQuestion.entries()]
    .filter(([, latest]) => !latest.isCorrect)
    .sort((a, b) => a[1].answeredAt - b[1].answeredAt)
    .map(([questionId]) => questionId)

  const due: Doc<'questions'>[] = []
  for (const questionId of dueQuestionIds) {
    const question = await ctx.db.get(questionId)
    if (question == null || !hasUsableMetadata(question) || !isInEligibilityPool(question, eligibilityPools)) {
      continue
    }
    due.push(question)
  }
  return due
}

/** Previously-missed questions resurfaced for spaced review (repaso). */
async function selectReviewMistakes(
  ctx: QueryCtx,
  config: SessionKindConfig,
  studentId: Id<'students'>,
): Promise<Selection[]> {
  const total = config.totalQuestions ?? 10
  const due = await collectDueReviewQuestions(ctx, studentId, config.eligibilityPools)

  return due.slice(0, total).map((question) => ({
    questionId: question._id,
    selectionReason: 'recent_mistake' as const,
    selectionMetadata: question.primarySubtopicId ?? question.subjectId ?? 'review',
  }))
}

async function buildSelection(
  ctx: QueryCtx,
  config: SessionKindConfig,
  studentId: Id<'students'>,
  subjectId: string | undefined,
  subtopicId: string | undefined,
  simulacroSessionNumber: number | undefined,
): Promise<Selection[]> {
  switch (config.strategy) {
    case 'balanced_by_subject':
      return selectBalancedBySubject(ctx, config)
    case 'simulacro_by_session': {
      const simulacroSession = getSimulacroSessionConfig(config, simulacroSessionNumber)
      return selectSubjectTargets(
        ctx,
        config,
        simulacroSession.subjectTargets,
        'balanced_coverage',
      )
    }
    case 'topic':
      if (subjectId == null) throw new Error('Topic practice requires a subject.')
      return selectTopic(ctx, config, studentId, subjectId, subtopicId)
    case 'recommended':
      return selectRecommended(ctx, config, studentId)
    case 'review_mistakes':
      return selectReviewMistakes(ctx, config, studentId)
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
    // Optional for `topic` practice launched from the syllabus by subtopic.
    subtopicId: v.optional(v.string()),
    simulacroSessionNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const config = getSessionKindConfig(args.kind)
    const timeLimitMs = getSessionTimeLimitMs(config, args.simulacroSessionNumber)

    if (config.requiresDiagnostic && !(await hasCompletedDiagnostic(ctx, args.studentId))) {
      throw new Error('Completa el diagnóstico antes de iniciar esta práctica.')
    }

    // A subtopic is only meaningful for topic practice. When given, validate it
    // and derive the parent subject so callers may pass just the subtopic.
    const subtopicId = args.kind === 'topic' ? args.subtopicId : undefined
    let subjectId = args.subjectId
    if (subtopicId != null) {
      const parentSubjectId = getSubjectIdForSubtopic(subtopicId)
      if (parentSubjectId == null) {
        throw new Error('Selecciona un subtema válido para esta práctica.')
      }
      if (subjectId != null && subjectId !== parentSubjectId) {
        throw new Error('El subtema no pertenece a la asignatura seleccionada.')
      }
      subjectId = parentSubjectId
    }

    if (config.requiresSubject) {
      if (subjectId == null || !SUBJECT_IDS.includes(subjectId)) {
        throw new Error('Selecciona una asignatura válida para esta práctica.')
      }
    }

    // Reuse an in-progress session of the same kind (and subject/subtopic, for
    // topic practice) instead of starting a duplicate.
    const active = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_kind_status', (q) =>
        q.eq('studentId', args.studentId).eq('kind', args.kind).eq('status', 'in_progress'),
      )
      .collect()
    const reusable = active.find(
      (session) =>
        (args.kind !== 'topic'
          || (session.subjectId === subjectId && session.subtopicId === subtopicId))
        && (args.kind !== 'simulacro'
          || session.simulacroSessionNumber === (args.simulacroSessionNumber ?? 1)),
    )
    if (reusable) {
      return reusable._id
    }

    const selected = await buildSelection(
      ctx,
      config,
      args.studentId,
      subjectId,
      subtopicId,
      args.simulacroSessionNumber,
    )
    if (selected.length === 0) {
      throw new Error('No hay preguntas disponibles para esta práctica.')
    }

    const now = Date.now()
    const sessionId = await ctx.db.insert('sessions', {
      studentId: args.studentId,
      kind: args.kind,
      status: 'in_progress',
      recommendationSource: recommendationSourceForKind(args.kind),
      subjectId: config.requiresSubject ? subjectId : undefined,
      subtopicId,
      simulacroSessionNumber: args.kind === 'simulacro'
        ? (args.simulacroSessionNumber ?? 1)
        : undefined,
      startedAt: now,
      timeLimitMs: timeLimitMs ?? undefined,
      expiresAt: timeLimitMs != null ? now + timeLimitMs : undefined,
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

export const getReviewQueue = query({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    // Count against the same eligibility pools `repaso` draws from, so the count
    // matches what a review session can actually launch.
    const config = getSessionKindConfig('repaso')
    const due = await collectDueReviewQuestions(ctx, args.studentId, config.eligibilityPools)
    return { dueCount: due.length }
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

export const getLatestSimulacroScore = query({
  args: {
    studentId: v.id('students'),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_studentId_kind', (q) =>
        q.eq('studentId', args.studentId).eq('kind', 'simulacro'),
      )
      .collect()
    const completed = sessions
      .filter((session) => session.status === 'completed' && session.summary != null)
      .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt))

    const latestBySessionNumber = new Map<number, Doc<'sessions'>>()
    for (const session of completed) {
      const sessionNumber = session.simulacroSessionNumber ?? 1
      if (!latestBySessionNumber.has(sessionNumber)) {
        latestBySessionNumber.set(sessionNumber, session)
      }
    }

    const subjectTotals = getSimulacroSubjectTargets()
    const scoreBuckets = new Map<string, { correctCount: number; answeredCount: number }>()
    for (const session of latestBySessionNumber.values()) {
      for (const score of session.summary?.subjectScores ?? []) {
        const bucket = scoreBuckets.get(score.subjectId) ?? {
          correctCount: 0,
          answeredCount: 0,
        }
        bucket.correctCount += score.correctCount
        bucket.answeredCount += score.answeredCount
        scoreBuckets.set(score.subjectId, bucket)
      }
    }

    const subjectScores = subjectTotals.map((target) => {
      const bucket = scoreBuckets.get(target.subjectId) ?? {
        correctCount: 0,
        answeredCount: 0,
      }
      return {
        subjectId: target.subjectId,
        correctCount: bucket.correctCount,
        answeredCount: bucket.answeredCount,
        questionCount: target.questionCount,
        score: Math.round((bucket.correctCount / target.questionCount) * 100),
      }
    })

    return {
      isComplete: latestBySessionNumber.has(1) && latestBySessionNumber.has(2),
      completedSessionNumbers: [...latestBySessionNumber.keys()].sort(),
      questionCount: subjectTotals.reduce((sum, target) => sum + target.questionCount, 0),
      subjectScores,
    }
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
    const sessionQuestions = await ctx.db
      .query('sessionQuestions')
      .withIndex('by_sessionId_position', (q) => q.eq('sessionId', args.sessionId))
      .collect()
    const questions = await Promise.all(
      sessionQuestions.map((sessionQuestion) => ctx.db.get(sessionQuestion.questionId)),
    )
    const attemptBySessionQuestionId = new Map(
      attempts.map((attempt) => [attempt.sessionQuestionId, attempt]),
    )
    const answeredAttempts = attempts.filter((attempt) => attempt.isCorrect != null)
    const correctCount = answeredAttempts.filter((attempt) => attempt.isCorrect).length
    const answeredCount = answeredAttempts.length
    const completedAt = Date.now()
    const rawDurationMs = completedAt - session.startedAt
    // For timed sessions, never report a duration beyond the allotted limit.
    const durationMs = session.timeLimitMs != null
      ? Math.min(rawDurationMs, session.timeLimitMs)
      : rawDurationMs

    const subjectBuckets = new Map<
      string,
      { correctCount: number; answeredCount: number; questionCount: number }
    >()
    sessionQuestions.forEach((sessionQuestion, index) => {
      const question = questions[index]
      if (question?.subjectId == null) return
      const bucket = subjectBuckets.get(question.subjectId) ?? {
        correctCount: 0,
        answeredCount: 0,
        questionCount: 0,
      }
      const attempt = attemptBySessionQuestionId.get(sessionQuestion._id)
      bucket.questionCount += 1
      if (attempt?.isCorrect != null) {
        bucket.answeredCount += 1
      }
      if (attempt?.isCorrect === true) {
        bucket.correctCount += 1
      }
      subjectBuckets.set(question.subjectId, bucket)
    })
    const subjectScores = [...subjectBuckets.entries()]
      .map(([subjectId, bucket]) => ({
        subjectId,
        correctCount: bucket.correctCount,
        answeredCount: bucket.answeredCount,
        questionCount: bucket.questionCount,
        score: bucket.questionCount === 0
          ? 0
          : Math.round((bucket.correctCount / bucket.questionCount) * 100),
      }))
      .sort((a, b) => a.subjectId.localeCompare(b.subjectId))

    const summary = {
      correctCount,
      answeredCount,
      questionCount: session.questionCount,
      accuracy: session.questionCount === 0 ? 0 : correctCount / session.questionCount,
      durationMs,
      subjectScores,
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
    subjectScores: session.summary?.subjectScores ?? [],
  }
}
