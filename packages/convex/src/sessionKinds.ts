/**
 * Unified session-kind configuration.
 *
 * Aprendo has several student-facing question flows (diagnostic, recommended
 * practice, topic practice, simulated exam). They are fundamentally the same
 * thing — an ordered set of questions a student solves and then reviews with
 * the tutor — so they all run on the SAME machinery (one `sessions` table, one
 * `sessions.ts` backend module, one solve screen, one review screen).
 *
 * The only thing that differs per kind is configuration: how many questions,
 * how they are selected, whether there is a time limit, whether the tutor is
 * available while solving, and whether the kind can be launched from the hub.
 *
 * This module is the single source of truth for that configuration and is
 * imported by both the Convex backend (relative import) and the web app
 * (via the `@aprendo/convex/sessionKinds` package export). Keep it free of any
 * Convex or framework imports so it stays portable and pure.
 *
 * To tune a kind, edit its entry below — nothing else needs to change.
 */

export const SESSION_KINDS = ['diagnostic', 'recommended', 'topic', 'simulacro'] as const
export type SessionKind = (typeof SESSION_KINDS)[number]

/** How the question set for a session is assembled. */
export type SelectionStrategy =
  /** Even spread across all subjects (diagnostic, simulacro). */
  | 'balanced_by_subject'
  /** Rule-based selection targeting the learner's weak areas. */
  | 'recommended'
  /** Concentrated in a single requested subject. */
  | 'topic'

/** Which question-bank eligibility tiers a kind may draw from. */
export type QuestionEligibilityPool = 'diagnostic' | 'practice_only'

export interface SessionKindConfig {
  kind: SessionKind
  /** Short Spanish label shown in the UI. */
  labelEs: string
  /** One-line Spanish description for hub cards / headers. */
  taglineEs: string
  strategy: SelectionStrategy
  /** Used by `balanced_by_subject`: questions drawn per subject. */
  questionsPerSubject?: number
  /** Used by `recommended` / `topic`: total questions in the session. */
  totalQuestions?: number
  eligibilityPools: QuestionEligibilityPool[]
  /** Time limit in ms, or `null` for an untimed session. */
  timeLimitMs: number | null
  /** Whether the tutor can assist during solve mode (review always allows it). */
  tutorInSolve: boolean
  /** Whether a completed diagnostic is required before this kind can start. */
  requiresDiagnostic: boolean
  /** Whether students can launch this kind from the practice hub. */
  launchableFromHub: boolean
  /** Whether the kind needs a `subjectId` argument (topic practice). */
  requiresSubject: boolean
}

const MINUTE_MS = 60_000

export const SESSION_KIND_CONFIG: Record<SessionKind, SessionKindConfig> = {
  diagnostic: {
    kind: 'diagnostic',
    labelEs: 'Diagnóstico inicial',
    taglineEs: 'Medimos tu punto de partida en las cinco áreas.',
    strategy: 'balanced_by_subject',
    questionsPerSubject: 4,
    eligibilityPools: ['diagnostic'],
    timeLimitMs: null,
    tutorInSolve: false,
    requiresDiagnostic: false,
    launchableFromHub: false,
    requiresSubject: false,
  },
  recommended: {
    kind: 'recommended',
    labelEs: 'Práctica recomendada',
    taglineEs: 'Una sesión corta enfocada en tus áreas más débiles.',
    strategy: 'recommended',
    totalQuestions: 10,
    eligibilityPools: ['diagnostic', 'practice_only'],
    timeLimitMs: null,
    tutorInSolve: false,
    requiresDiagnostic: true,
    launchableFromHub: true,
    requiresSubject: false,
  },
  topic: {
    kind: 'topic',
    labelEs: 'Práctica por tema',
    taglineEs: 'Elige una asignatura y practica preguntas de ese tema.',
    strategy: 'topic',
    totalQuestions: 10,
    eligibilityPools: ['diagnostic', 'practice_only'],
    timeLimitMs: null,
    tutorInSolve: false,
    requiresDiagnostic: true,
    launchableFromHub: true,
    requiresSubject: true,
  },
  simulacro: {
    kind: 'simulacro',
    labelEs: 'Simulacro de examen',
    taglineEs: 'Practica como en el examen real: preguntas de todas las áreas, con tiempo.',
    strategy: 'balanced_by_subject',
    questionsPerSubject: 10,
    eligibilityPools: ['diagnostic', 'practice_only'],
    // 10 preguntas por área × 5 áreas = 50 preguntas. ~1.2 min por pregunta.
    timeLimitMs: 60 * MINUTE_MS,
    tutorInSolve: false,
    requiresDiagnostic: true,
    launchableFromHub: true,
    requiresSubject: false,
  },
}

export function getSessionKindConfig(kind: SessionKind): SessionKindConfig {
  return SESSION_KIND_CONFIG[kind]
}

/** Kinds the student can start from the practice hub, in display order. */
export const LAUNCHABLE_SESSION_KINDS: SessionKind[] = SESSION_KINDS.filter(
  (kind) => SESSION_KIND_CONFIG[kind].launchableFromHub,
)

/** Whether a value is a known session kind (handy for narrowing). */
export function isSessionKind(value: string): value is SessionKind {
  return (SESSION_KINDS as readonly string[]).includes(value)
}
