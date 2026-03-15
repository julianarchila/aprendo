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

  return (
    <div className="fade-in mx-auto max-w-3xl">
      {/* Progress bar */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          Pregunta <span className="font-semibold text-[var(--text-primary)]">{currentIndex + 1}</span> de {questions.length}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">{answeredCount}</span> respondidas
        </p>
      </div>

      {/* Track bar */}
      <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-[var(--bg-inset)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <div className="card mb-5 p-6 sm:p-8">
        <div className="mb-4">
          <span className="chip chip-accent">
            {getSubjectLabel(currentQuestion.question.subjectId ?? 'sin_asignar')}
          </span>
        </div>
        <MarkdownBlock markdown={currentQuestion.question.bodyMarkdown} />
      </div>

      {/* Options */}
      <div className="mb-5 space-y-3">
        {currentQuestion.question.options.map((option) => {
          const isSelected = currentQuestion.attempt?.selectedOption === option.label
          return (
            <button
              key={option.label}
              type="button"
              disabled={answerMutation.isPending || completeMutation.isPending}
              onClick={() => answerMutation.mutate(option.label)}
              className={`option-card ${isSelected ? 'is-selected' : ''}`}
            >
              <span className="option-label">{option.label}</span>
              <span className="flex-1">
                <MarkdownBlock markdown={option.bodyMarkdown} />
              </span>
            </button>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
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

      {/* Question map */}
      <div className="mt-8 card p-5">
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
                  'flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-xs font-semibold transition',
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
  )
}

/* ─── Progress Tab ─── */

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
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
  const subjectAggregates = progress?.subjectAggregates ?? []
  const weakestSubtopics = progress?.weakestSubtopics ?? []

  if (overallSummary == null || diagnostic?.status !== 'completed') {
    return (
      <div className="fade-in mx-auto max-w-xl">
        <div className="card p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-inset)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">
            Aun no tienes resultados
          </h2>
          <p className="mb-6 text-sm text-[var(--text-secondary)]">
            Tu pagina de progreso aparecera cuando completes el primer diagnostico.
          </p>
          <Link
            to="/dashboard"
            search={{}}
            className="btn-primary no-underline"
          >
            Ir al diagnostico
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in mx-auto max-w-4xl">
      {/* Overall score */}
      <div className="mb-8 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="card flex flex-col items-center px-8 py-8">
          <div className="flex h-28 w-28 items-center justify-center rounded-full border-[6px] border-[var(--accent-medium)] bg-[var(--bg-card)]">
            <span className="text-4xl font-bold text-[var(--text-primary)]">
              {Math.round(overallSummary.accuracy * 100)}
            </span>
          </div>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            {overallSummary.correctCount} de {overallSummary.questionCount} correctas
          </p>
        </div>

        <div className="flex-1">
          <h2 className="mb-1 text-xl font-semibold text-[var(--text-primary)]">
            Resultado del diagnostico
          </h2>
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            Linea base despues del diagnostico para {session.email}. Todavia no hay practica adaptativa.
          </p>

          {/* Subject bars */}
          <div className="space-y-3">
            {subjectAggregates.map((agg) => (
              <div key={agg._id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {getSubjectLabel(agg.subjectId)}
                  </span>
                  <span className="text-sm font-semibold text-[var(--accent-text)]">
                    {formatPercent(agg.accuracy)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-inset)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out"
                    style={{ width: formatPercent(agg.accuracy) }}
                  />
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  {agg.correctCount} de {agg.attemptCount} &middot; evidencia {agg.evidenceLevel}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weakest subtopics */}
      <div className="card p-6">
        <h3 className="mb-1 text-lg font-semibold text-[var(--text-primary)]">
          Subtemas que merecen atencion
        </h3>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Alertas tempranas basadas en tu diagnostico inicial.
        </p>

        {weakestSubtopics.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">
            Aun no hay suficiente evidencia para senalar subtemas concretos.
          </p>
        ) : (
          <div className="space-y-2">
            {weakestSubtopics.map((agg) => (
              <div
                key={agg._id}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-inset)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {getSubtopicLabel(agg.subtopicId ?? 'sin_subtema')}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {getSubjectLabel(agg.subjectId)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[var(--accent-text)]">
                  {formatPercent(agg.accuracy)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
