import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { api } from '@aprendo/convex/api'
import MarkdownBlock from './MarkdownBlock.tsx'
import { diagnosticSessionQuery } from '../lib/student-queries.ts'
import { getSubjectLabel } from '../lib/taxonomy.ts'
import type { StoredStudentSession } from '../lib/student-session.ts'

export function DiagnosticExamPage({ session }: { session: StoredStudentSession }) {
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
      await navigate({ to: '/practice' })
    },
  })

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

  if (createSessionMutation.isPending || diagnosticQuery.isPending || diagnostic == null) {
    return (
      <div className="fade-in mx-auto max-w-xl py-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">Preparando tu evaluacion...</p>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]
  const answeredCount = questions.filter((q) => q.attempt != null).length

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

  const hasImageOptions = currentQuestion.question.options.some(
    (opt) => /!\[.*?\]\(.*?\)/.test(opt.bodyMarkdown) || /<img\s/i.test(opt.bodyMarkdown),
  )

  return (
    <div className="fade-in mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          Pregunta <span className="font-semibold text-[var(--text-primary)]">{currentIndex + 1}</span> de {questions.length}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">{answeredCount}</span> respondidas
        </p>
      </div>

      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--bg-inset)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <div className="card mb-5 p-5 sm:p-6">
            <div className="mb-3">
              <span className="chip chip-accent">
                {getSubjectLabel(currentQuestion.question.subjectId ?? 'sin_asignar')}
              </span>
            </div>
            <MarkdownBlock markdown={currentQuestion.question.bodyMarkdown} />
          </div>

          <div className={hasImageOptions ? 'mb-5 grid grid-cols-2 gap-2.5 options-has-images' : 'mb-5 space-y-3'}>
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
