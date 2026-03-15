import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { api } from '@aprendo/convex/api'
import MarkdownBlock from '../components/MarkdownBlock.tsx'
import {
  diagnosticSessionQuery,
  latestDiagnosticQuery,
  studentProgressQuery,
} from '../lib/student-queries.ts'
import { getSubjectLabel, getSubtopicLabel } from '../lib/taxonomy.ts'
import {
  clearStoredStudentSession,
  useStoredStudentSession,
} from '../lib/student-session.ts'
import ThemeToggle from '../components/ThemeToggle.tsx'

type DashboardTab = 'diagnostic' | 'progress'

type DashboardSearch = {
  tab?: DashboardTab
}

export const Route = createFileRoute('/dashboard')({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    tab: search.tab === 'progress' ? 'progress' : undefined,
  }),
  component: DashboardPage,
})

/* ─── Shell ─── */

function DashboardPage() {
  const navigate = useNavigate()
  const { session, isReady, clearSession } = useStoredStudentSession()
  const search = Route.useSearch()
  const activeTab: DashboardTab = search.tab ?? 'diagnostic'

  useEffect(() => {
    if (isReady && session == null) {
      void navigate({ to: '/login' })
    }
  }, [isReady, navigate, session])

  if (!isReady || session == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Top bar */}
      <header className="border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="page-container flex flex-wrap items-center justify-between gap-3 py-3">
          {/* Brand */}
          <Link
            to="/"
            className="flex items-center gap-2.5 text-[var(--text-primary)] no-underline"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-accent)] bg-[var(--accent-soft)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-sm font-semibold">Aprendo</span>
          </Link>

          {/* Center tabs */}
          <nav className="tab-nav">
            <Link
              to="/dashboard"
              search={{}}
              className={`tab-item ${activeTab === 'diagnostic' ? 'is-active' : ''}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              Diagnostico
            </Link>
            <Link
              to="/dashboard"
              search={{ tab: 'progress' }}
              className={`tab-item ${activeTab === 'progress' ? 'is-active' : ''}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
              Progreso
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => {
                clearStoredStudentSession()
                clearSession()
                void navigate({ to: '/' })
              }}
              className="btn-ghost text-xs"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="page-container px-4 py-8">
        {activeTab === 'diagnostic' ? (
          <DiagnosticTab session={session} />
        ) : (
          <ProgressTab session={session} />
        )}
      </main>
    </div>
  )
}

/* ─── Diagnostic Tab ─── */

function DiagnosticTab({ session }: { session: { studentId: string; email: string } }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [diagnosticSessionId, setDiagnosticSessionId] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasTriedSessionCreation, setHasTriedSessionCreation] = useState(false)
  const questionStartedAtRef = useRef<number>(Date.now())

  const createDiagnosticSession = useConvexMutation(api.diagnostics.createOrGetDiagnosticSession)
  const submitDiagnosticAnswer = useConvexMutation(api.diagnostics.submitDiagnosticAnswer)
  const completeDiagnosticSession = useConvexMutation(api.diagnostics.completeDiagnosticSession)

  const createSessionMutation = useMutation({
    mutationFn: async (studentId: string) => {
      return createDiagnosticSession({ studentId: studentId as never })
    },
    onMutate: () => setHasTriedSessionCreation(true),
    onSuccess: (sessionId) => setDiagnosticSessionId(sessionId),
  })

  useEffect(() => {
    if (
      diagnosticSessionId != null
      || createSessionMutation.isPending
      || hasTriedSessionCreation
    ) return
    createSessionMutation.mutate(session.studentId)
  }, [createSessionMutation, diagnosticSessionId, hasTriedSessionCreation, session.studentId])

  const diagnosticQuery = useQuery({
    ...diagnosticSessionQuery(diagnosticSessionId ?? ''),
    enabled: diagnosticSessionId != null,
  })

  const diagnostic = diagnosticQuery.data
  const questions = diagnostic?.questions ?? []

  useEffect(() => {
    if (diagnostic?.session) {
      setCurrentIndex(Math.max(0, diagnostic.session.currentPosition - 1))
    }
  }, [diagnostic?.session])

  useEffect(() => {
    questionStartedAtRef.current = Date.now()
  }, [currentIndex])

  const answerMutation = useMutation({
    mutationFn: async (selectedOption: string) => {
      const currentQuestion = questions[currentIndex]
      if (diagnostic?.session == null || currentQuestion == null) {
        throw new Error('Pregunta no cargada.')
      }
      return submitDiagnosticAnswer({
        sessionId: diagnostic.session._id,
        sessionQuestionId: currentQuestion.sessionQuestionId as never,
        selectedOption,
        responseTimeMs: Date.now() - questionStartedAtRef.current,
      })
    },
    onSuccess: async () => {
      if (diagnosticSessionId == null) return
      await queryClient.invalidateQueries({
        queryKey: diagnosticSessionQuery(diagnosticSessionId).queryKey,
      })
    },
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (diagnostic?.session == null) throw new Error('Sesion no cargada.')
      return completeDiagnosticSession({ sessionId: diagnostic.session._id })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      await navigate({ to: '/dashboard', search: { tab: 'progress' } })
    },
  })

  // Error creating session
  if (createSessionMutation.error && diagnosticSessionId == null) {
    return (
      <div className="fade-in mx-auto max-w-xl">
        <div className="card p-8">
          <h2 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">
            No pudimos crear tu diagnostico
          </h2>
          <p className="mb-6 text-sm text-[var(--text-secondary)]">
            {createSessionMutation.error instanceof Error
              ? createSessionMutation.error.message
              : 'La creacion del diagnostico fallo.'}
          </p>
          <button
            type="button"
            onClick={() => {
              createSessionMutation.reset()
              setHasTriedSessionCreation(false)
              createSessionMutation.mutate(session.studentId)
            }}
            className="btn-primary"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // Loading
  if (createSessionMutation.isPending || diagnosticQuery.isPending || diagnostic == null) {
    return (
      <div className="fade-in mx-auto max-w-xl py-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">Preparando tu evaluacion...</p>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]
  const answeredCount = questions.filter((q) => q.attempt != null).length

  // No questions available
  if (currentQuestion == null) {
    return (
      <div className="fade-in mx-auto max-w-xl">
        <div className="card p-8">
          <h2 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">
            No hay preguntas disponibles
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            El banco de preguntas todavia no tiene suficiente inventario para un diagnostico.
          </p>
        </div>
      </div>
    )
  }

  // Detect if any option contains an image (markdown image syntax)
  const hasImageOptions = currentQuestion.question.options.some(
    (opt) => /!\[.*?\]\(.*?\)/.test(opt.bodyMarkdown) || /<img\s/i.test(opt.bodyMarkdown),
  )

  return (
    <div className="fade-in mx-auto max-w-6xl">
      {/* Progress bar */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          Pregunta <span className="font-semibold text-[var(--text-primary)]">{currentIndex + 1}</span> de {questions.length}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">{answeredCount}</span> respondidas
        </p>
      </div>

      {/* Track bar */}
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--bg-inset)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      {/* Two-column layout: question area + sticky sidebar */}
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        {/* Left: question + options + nav */}
        <div className="min-w-0">
          {/* Question card */}
          <div className="card mb-5 p-5 sm:p-6">
            <div className="mb-3">
              <span className="chip chip-accent">
                {getSubjectLabel(currentQuestion.question.subjectId ?? 'sin_asignar')}
              </span>
            </div>
            <MarkdownBlock markdown={currentQuestion.question.bodyMarkdown} />
          </div>

          {/* Options -- grid for image options, stack for text */}
          <div className={hasImageOptions
            ? 'mb-5 grid grid-cols-2 gap-2.5 options-has-images'
            : 'mb-5 space-y-3'
          }>
            {currentQuestion.question.options.map((option) => {
              const isSelected = currentQuestion.attempt?.selectedOption === option.label
              return (
                <div
                  key={option.label}
                  role="button"
                  tabIndex={answerMutation.isPending || completeMutation.isPending ? -1 : 0}
                  aria-disabled={answerMutation.isPending || completeMutation.isPending}
                  onClick={() => {
                    if (answerMutation.isPending || completeMutation.isPending) return
                    answerMutation.mutate(option.label)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (answerMutation.isPending || completeMutation.isPending) return
                      answerMutation.mutate(option.label)
                    }
                  }}
                  className={[
                    hasImageOptions ? 'option-card option-card-image' : 'option-card',
                    isSelected ? 'is-selected' : '',
                    (answerMutation.isPending || completeMutation.isPending) ? 'pointer-events-none opacity-60' : '',
                  ].join(' ')}
                >
                  <span className="option-label">{option.label}</span>
                  <span className="flex-1 min-w-0">
                    <MarkdownBlock markdown={option.bodyMarkdown} />
                  </span>
                </div>
              )
            })}
          </div>

          {/* Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((v) => Math.max(0, v - 1))}
                className="btn-secondary"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
                Anterior
              </button>
              <button
                type="button"
                disabled={currentIndex >= questions.length - 1}
                onClick={() => setCurrentIndex((v) => Math.min(questions.length - 1, v + 1))}
                className="btn-secondary"
              >
                Siguiente
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate()}
              className="btn-primary"
            >
              {completeMutation.isPending ? 'Cerrando...' : 'Terminar diagnostico'}
            </button>
          </div>

          {/* Errors */}
          {answerMutation.error ? (
            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-accent)] bg-[var(--accent-soft)] p-4 text-sm font-medium text-[var(--accent-text)]">
              {answerMutation.error instanceof Error ? answerMutation.error.message : 'No se pudo guardar la respuesta.'}
            </div>
          ) : null}
          {completeMutation.error ? (
            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-accent)] bg-[var(--accent-soft)] p-4 text-sm font-medium text-[var(--accent-text)]">
              {completeMutation.error instanceof Error ? completeMutation.error.message : 'No se pudo completar el diagnostico.'}
            </div>
          ) : null}
        </div>

        {/* Right: sticky exam map sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <div className="card p-4">
              <p className="kicker mb-3">Mapa del examen</p>
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((q, idx) => {
                  const isAnswered = q.attempt != null
                  const isCurrent = idx === currentIndex
                  return (
                    <button
                      key={q.sessionQuestionId}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={[
                        'flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[0.6875rem] font-semibold transition',
                        isCurrent
                          ? 'bg-[var(--accent)] text-[var(--text-inverted)]'
                          : isAnswered
                            ? 'bg-[var(--success-soft)] text-[var(--success-text)] border border-transparent'
                            : 'bg-[var(--bg-inset)] text-[var(--text-tertiary)] border border-[var(--border)]',
                      ].join(' ')}
                    >
                      {q.position}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border)] pt-3">
                <span className="flex items-center gap-1.5 text-[0.625rem] text-[var(--text-tertiary)]">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />
                  Actual
                </span>
                <span className="flex items-center gap-1.5 text-[0.625rem] text-[var(--text-tertiary)]">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--success-soft)] border border-[var(--success-text)]" />
                  Respondida
                </span>
                <span className="flex items-center gap-1.5 text-[0.625rem] text-[var(--text-tertiary)]">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--bg-inset)] border border-[var(--border)]" />
                  Pendiente
                </span>
              </div>
            </div>

            {/* Compact stats */}
            <div className="mt-3 card px-4 py-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-tertiary)]">Progreso</span>
                <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                  {answeredCount}/{questions.length}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--bg-inset)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
                  style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile-only question map (shown below on small screens) */}
      <div className="mt-6 card p-4 lg:hidden">
        <p className="kicker mb-3">Mapa del examen</p>
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, idx) => {
            const isAnswered = q.attempt != null
            const isCurrent = idx === currentIndex
            return (
              <button
                key={q.sessionQuestionId}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[0.6875rem] font-semibold transition',
                  isCurrent
                    ? 'bg-[var(--accent)] text-[var(--text-inverted)]'
                    : isAnswered
                      ? 'bg-[var(--success-soft)] text-[var(--success-text)] border border-transparent'
                      : 'bg-[var(--bg-inset)] text-[var(--text-tertiary)] border border-[var(--border)]',
                ].join(' ')}
              >
                {q.position}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Progress Tab ─── */

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function normalizeEvidenceLevel(level: string): 'low' | 'medium' | 'high' {
  if (level === 'high' || level === 'medium') return level
  return 'low'
}

function getReadinessBand(masteryScore: number, evidenceLevel: string) {
  const normalizedEvidenceLevel = normalizeEvidenceLevel(evidenceLevel)

  if (normalizedEvidenceLevel === 'low') {
    return {
      label: 'Lectura inicial',
      color: 'var(--text-tertiary)',
      tone: 'bg-[var(--bg-inset)] text-[var(--text-secondary)] border-[var(--border)]',
    }
  }
  if (masteryScore >= 0.72) {
    return {
      label: 'Bien encaminada',
      color: 'var(--success)',
      tone: 'bg-[var(--success-soft)] text-[var(--success-text)] border-transparent',
    }
  }
  if (masteryScore >= 0.5) {
    return {
      label: 'En desarrollo',
      color: 'var(--accent)',
      tone: 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-transparent',
    }
  }
  return {
    label: 'Prioridad de refuerzo',
    color: 'var(--accent-text)',
    tone: 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-transparent',
  }
}

function getOverallReadinessSummary(
  subjectAggregates: Array<{
    masteryScore: number
    evidenceLevel: string
  }>,
) {
  if (subjectAggregates.length === 0) {
    return { title: 'Aun no hay una lectura clara' }
  }

  const averageMastery = subjectAggregates.reduce((sum, agg) => sum + agg.masteryScore, 0) / subjectAggregates.length
  const lowEvidenceCount = subjectAggregates.filter(
    (agg) => normalizeEvidenceLevel(agg.evidenceLevel) === 'low',
  ).length

  if (lowEvidenceCount >= Math.ceil(subjectAggregates.length / 2)) {
    return { title: 'Este es tu punto de partida' }
  }
  if (averageMastery >= 0.68) {
    return { title: 'Tienes una base competitiva' }
  }
  if (averageMastery >= 0.5) {
    return { title: 'Tu preparacion va por buen camino' }
  }
  return { title: 'Hay oportunidades claras de mejora' }
}

/* ── Ring Progress ── */

function RingProgress({
  value,
  size = 48,
  strokeWidth = 4,
  color,
}: {
  value: number
  size?: number
  strokeWidth?: number
  color: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value * circumference)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="progress-ring"
      />
    </svg>
  )
}

function ProgressTab({ session }: { session: { studentId: string; email: string } }) {
  const progressQuery = useQuery({
    ...studentProgressQuery(session.studentId),
    enabled: true,
  })
  const latestDiagnostic = useQuery({
    ...latestDiagnosticQuery(session.studentId),
    enabled: true,
  })

  if (progressQuery.isPending || latestDiagnostic.isPending) {
    return (
      <div className="fade-in mx-auto max-w-xl py-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">Preparando tu resumen...</p>
      </div>
    )
  }

  const progress = progressQuery.data
  const diagnostic = latestDiagnostic.data
  const overallSummary = progress?.snapshot?.overallSummary
  const subjectAggregates = [...(progress?.subjectAggregates ?? [])].sort(
    (a, b) => b.masteryScore - a.masteryScore,
  )
  const weakestSubtopics = progress?.weakestSubtopics ?? []
  const readinessSummary = getOverallReadinessSummary(subjectAggregates)

  if (overallSummary == null || diagnostic?.status !== 'completed') {
    return (
      <div className="fade-in mx-auto max-w-md">
        <div className="card relative overflow-hidden p-8 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_65%)]" />
          <div className="relative">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-inset)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
            </div>
            <h2 className="mb-2 font-display text-2xl italic text-[var(--text-primary)]">
              Aun no tienes resultados
            </h2>
            <p className="mx-auto mb-6 max-w-xs text-sm text-[var(--text-secondary)]">
              Completa el diagnostico para ver tu progreso.
            </p>
            <Link to="/dashboard" search={{}} className="btn-primary no-underline">
              Ir al diagnostico
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in mx-auto max-w-5xl space-y-5">
      {/* ── Header ── */}
      <div className="card progress-hero relative overflow-hidden px-6 py-5 sm:px-8 sm:py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--accent-soft),transparent_55%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="kicker mb-1">Mapa de preparacion</p>
            <h2 className="font-display text-2xl italic tracking-tight text-[var(--text-primary)] sm:text-3xl">
              {readinessSummary.title}
            </h2>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
              {formatPercent(overallSummary.accuracy)}
            </p>
            <p className="text-xs font-medium text-[var(--text-tertiary)]">precision general</p>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Left: subject cards */}
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Por materia</h3>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {subjectAggregates.map((agg) => {
              const readiness = getReadinessBand(agg.masteryScore, agg.evidenceLevel)
              return (
                <div key={agg._id} className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="relative shrink-0">
                    <RingProgress
                      value={agg.masteryScore}
                      size={44}
                      strokeWidth={4}
                      color={readiness.color}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums text-[var(--text-primary)]">
                      {formatPercent(agg.masteryScore)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {getSubjectLabel(agg.subjectId)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold ${readiness.tone}`}>
                    {readiness.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: focus subtopics */}
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Para trabajar ahora</h3>
          </div>
          {weakestSubtopics.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[var(--text-tertiary)]">
                Practica mas para obtener recomendaciones.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {weakestSubtopics.slice(0, 5).map((agg, index) => (
                <div key={agg._id} className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[0.6875rem] font-bold text-[var(--accent-text)]">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {getSubtopicLabel(agg.subtopicId ?? 'sin_subtema')}
                    </p>
                    <p className="text-[0.6875rem] text-[var(--text-tertiary)]">
                      {getSubjectLabel(agg.subjectId)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--text-tertiary)]">
                    {formatPercent(agg.masteryScore)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
