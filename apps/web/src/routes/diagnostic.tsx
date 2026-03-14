import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { api } from '@aprendo/convex/api'
import MarkdownBlock from '../components/MarkdownBlock'
import { diagnosticSessionQuery } from '../lib/student-queries'
import { getSubjectLabel } from '../lib/taxonomy'
import { useStoredStudentSession } from '../lib/student-session'

export const Route = createFileRoute('/diagnostic')({
  component: DiagnosticPage,
})

function DiagnosticPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session, isReady } = useStoredStudentSession()
  const [diagnosticSessionId, setDiagnosticSessionId] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasTriedSessionCreation, setHasTriedSessionCreation] = useState(false)
  const questionStartedAtRef = useRef<number>(Date.now())
  const createDiagnosticSession = useConvexMutation(api.diagnostics.createOrGetDiagnosticSession)
  const submitDiagnosticAnswer = useConvexMutation(api.diagnostics.submitDiagnosticAnswer)
  const completeDiagnosticSession = useConvexMutation(api.diagnostics.completeDiagnosticSession)
  const createSessionMutation = useMutation({
    mutationFn: async (studentId: string) => {
      return createDiagnosticSession({
        studentId: studentId as never,
      })
    },
    onMutate: () => {
      setHasTriedSessionCreation(true)
    },
    onSuccess: (sessionId) => {
      setDiagnosticSessionId(sessionId)
    },
  })

  useEffect(() => {
    if (isReady && session == null) {
      void navigate({ to: '/' })
    }
  }, [isReady, navigate, session])

  useEffect(() => {
    if (
      !isReady
      || session == null
      || diagnosticSessionId != null
      || createSessionMutation.isPending
      || hasTriedSessionCreation
    ) {
      return
    }

    createSessionMutation.mutate(session.studentId)
  }, [createSessionMutation, diagnosticSessionId, hasTriedSessionCreation, isReady, session])

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
        throw new Error('Diagnostic question not loaded.')
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
      if (diagnostic?.session == null) {
        throw new Error('Diagnostic session not loaded.')
      }

      return completeDiagnosticSession({
        sessionId: diagnostic.session._id,
      })
    },
    onSuccess: async () => {
      if (session == null) return
      await queryClient.invalidateQueries()
      await navigate({
        to: '/progress',
      })
    },
  })

  if (!isReady || session == null) {
    return (
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-[2rem] p-6 sm:p-8">
          <p className="island-kicker mb-2">Diagnostico</p>
          <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            Cargando...
          </h1>
        </section>
      </main>
    )
  }

  if (createSessionMutation.isPending || diagnosticQuery.isPending || diagnostic == null) {
    if (createSessionMutation.error && diagnosticSessionId == null) {
      return (
        <main className="page-wrap px-4 py-12">
          <section className="island-shell rounded-[2rem] p-6 sm:p-8">
            <p className="island-kicker mb-2">Diagnostico</p>
            <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
              No pudimos crear tu diagnostico
            </h1>
            <p className="max-w-2xl text-sm leading-8 text-[var(--sea-ink-soft)]">
              {createSessionMutation.error instanceof Error
                ? createSessionMutation.error.message
                : 'La creacion del diagnostico fallo.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (session == null) return
                  createSessionMutation.reset()
                  setHasTriedSessionCreation(false)
                  createSessionMutation.mutate(session.studentId)
                }}
                className="rounded-full border border-[rgba(235,122,111,0.28)] bg-[linear-gradient(135deg,#f39b8f,#ea7a6f)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(234,122,111,0.24)] transition hover:-translate-y-0.5"
              >
                Reintentar
              </button>
              <Link
                to="/"
                className="rounded-full border border-[rgba(23,58,64,0.12)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5"
              >
                Volver al inicio
              </Link>
            </div>
          </section>
        </main>
      )
    }

    return (
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-[2rem] p-6 sm:p-8">
          <p className="island-kicker mb-2">Diagnostico</p>
          <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            Preparando tu evaluacion...
          </h1>
        </section>
      </main>
    )
  }

  const currentQuestion = questions[currentIndex]
  const answeredCount = questions.filter((question) => question.attempt != null).length

  if (currentQuestion == null) {
    return (
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-[2rem] p-6 sm:p-8">
          <p className="island-kicker mb-2">Diagnostico</p>
          <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            No hay preguntas listas para este diagnostico.
          </h1>
          <p className="text-[var(--sea-ink-soft)]">
            El banco de preguntas todavia no tiene suficiente inventario
            diagnosticable.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="page-wrap px-4 py-8">
      <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="island-kicker mb-2">Diagnostico</p>
          <h1 className="display-title m-0 text-4xl font-bold text-[var(--sea-ink)]">
            Tu punto de partida ICFES
          </h1>
          <p className="mt-3 mb-0 max-w-2xl text-sm leading-7 text-[var(--sea-ink-soft)]">
            No hay tutor ni explicaciones durante esta evaluacion. Responde con
            calma y termina cuando hayas cubierto todas las preguntas.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-5 py-4 text-sm text-[var(--sea-ink-soft)] shadow-[0_14px_28px_rgba(23,58,64,0.08)]">
          <strong className="text-[var(--sea-ink)]">{answeredCount}</strong>
          {' '}
          de
          {' '}
          <strong className="text-[var(--sea-ink)]">{questions.length}</strong>
          {' '}
          respondidas
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5">
          <article className="island-shell rounded-[2rem] p-6 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[rgba(235,122,111,0.2)] bg-[rgba(235,122,111,0.12)] px-3 py-1 text-xs font-semibold tracking-[0.14em] text-[color:#b4534a] uppercase">
                {getSubjectLabel(currentQuestion.question.subjectId ?? 'sin_asignar')}
              </span>
              <span className="text-sm text-[var(--sea-ink-soft)]">
                Pregunta {currentQuestion.position} / {questions.length}
              </span>
            </div>
            <MarkdownBlock markdown={currentQuestion.question.bodyMarkdown} />
          </article>

          <section className="grid gap-4">
            {currentQuestion.question.options.map((option) => {
              const isSelected = currentQuestion.attempt?.selectedOption === option.label
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={answerMutation.isPending || completeMutation.isPending}
                  onClick={() => {
                    answerMutation.mutate(option.label)
                  }}
                  className={[
                    'feature-card rounded-[1.5rem] border p-5 text-left',
                    isSelected
                      ? 'border-[rgba(235,122,111,0.42)] bg-[rgba(235,122,111,0.08)]'
                      : 'border-[rgba(23,58,64,0.12)]',
                  ].join(' ')}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(23,58,64,0.12)] bg-white text-sm font-bold text-[var(--sea-ink)]">
                      {option.label}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sea-ink-soft)]">
                      Opcion
                    </span>
                  </div>
                  <MarkdownBlock markdown={option.bodyMarkdown} />
                </button>
              )
            })}
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-[var(--line)] bg-white/65 p-4">
            <div className="flex gap-3">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => {
                  setCurrentIndex((value) => Math.max(0, value - 1))
                }}
                className="rounded-full border border-[rgba(23,58,64,0.12)] bg-white px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={currentIndex >= questions.length - 1}
                onClick={() => {
                  setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))
                }}
                className="rounded-full border border-[rgba(23,58,64,0.12)] bg-white px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>

            <button
              type="button"
              disabled={completeMutation.isPending}
              onClick={() => {
                completeMutation.mutate()
              }}
              className="rounded-full border border-[rgba(235,122,111,0.28)] bg-[linear-gradient(135deg,#f39b8f,#ea7a6f)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(234,122,111,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {completeMutation.isPending ? 'Cerrando...' : 'Terminar diagnostico'}
            </button>
          </section>
        </section>

        <aside className="space-y-4">
          <section className="island-shell rounded-[1.8rem] p-5">
            <p className="island-kicker mb-3">Mapa del examen</p>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((question, index) => {
                const isAnswered = question.attempt != null
                const isCurrent = index === currentIndex
                return (
                  <button
                    key={question.sessionQuestionId}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(index)
                    }}
                    className={[
                      'flex h-11 items-center justify-center rounded-[1rem] border text-sm font-semibold transition',
                      isCurrent
                        ? 'border-[rgba(235,122,111,0.34)] bg-[rgba(235,122,111,0.14)] text-[color:#b4534a]'
                        : isAnswered
                          ? 'border-[rgba(79,184,178,0.3)] bg-[rgba(79,184,178,0.12)] text-[var(--lagoon-deep)]'
                          : 'border-[rgba(23,58,64,0.12)] bg-white text-[var(--sea-ink-soft)]',
                    ].join(' ')}
                  >
                    {question.position}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="island-shell rounded-[1.8rem] p-5">
            <p className="island-kicker mb-2">Estado</p>
            <p className="m-0 text-sm leading-7 text-[var(--sea-ink-soft)]">
              Sesion para
              {' '}
              <strong className="text-[var(--sea-ink)]">{session.email}</strong>
              . Cuando termines, iremos directo a tu pagina de progreso.
            </p>
          </section>

          {answerMutation.error ? (
            <section className="rounded-[1.4rem] border border-[rgba(180,83,74,0.22)] bg-[rgba(235,122,111,0.08)] p-4 text-sm font-semibold text-[color:#b4534a]">
              {answerMutation.error instanceof Error ? answerMutation.error.message : 'No se pudo guardar la respuesta.'}
            </section>
          ) : null}
          {completeMutation.error ? (
            <section className="rounded-[1.4rem] border border-[rgba(180,83,74,0.22)] bg-[rgba(235,122,111,0.08)] p-4 text-sm font-semibold text-[color:#b4534a]">
              {completeMutation.error instanceof Error ? completeMutation.error.message : 'No se pudo completar el diagnostico.'}
            </section>
          ) : null}
          <Link
            to="/"
            className="inline-flex rounded-full border border-[rgba(23,58,64,0.12)] bg-white px-4 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] no-underline transition hover:-translate-y-0.5 hover:text-[var(--sea-ink)]"
          >
            Volver al inicio
          </Link>
        </aside>
      </section>
    </main>
  )
}
