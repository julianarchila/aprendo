import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router'
import { BookOpen, ChevronLeft, ChevronRight, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '@aprendo/convex/api'
import MarkdownBlock from '../components/MarkdownBlock.tsx'
import { StudentAppShell } from '../components/StudentAppShell.tsx'
import { practiceSessionQuery, studentAppStateQuery } from '../lib/student-queries.ts'
import { useCurrentStudent } from '../lib/student-session.ts'
import { getSubjectLabel } from '../lib/taxonomy.ts'

export const Route = createFileRoute('/practice/$sessionId')({
  component: PracticeSolvePage,
})

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function PracticeSolvePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { sessionId } = Route.useParams()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isReviewRoute = pathname.endsWith('/review')
  const { session, isReady } = useCurrentStudent()
  const appStateQuery = useQuery({
    ...studentAppStateQuery(session?.studentId),
    enabled: isReady && session != null,
  })
  const practiceQuery = useQuery({
    ...practiceSessionQuery(sessionId),
    enabled: isReady && session != null,
  })
  const submitPracticeAnswer = useConvexMutation(api.practice.submitPracticeAnswer)
  const clearPracticeAnswer = useConvexMutation(api.practice.clearPracticeAnswer)
  const completePracticeSession = useConvexMutation(api.practice.completePracticeSession)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const questionStartedAtRef = useRef(Date.now())

  useEffect(() => {
    if (isReviewRoute) return
    if (isReady && session == null) {
      void navigate({ to: '/login' })
    }
  }, [isReady, isReviewRoute, navigate, session])

  useEffect(() => {
    if (isReviewRoute) return
    if (!isReady || session == null || appStateQuery.data == null) return
    if (!appStateQuery.data.hasCompletedDiagnostic) {
      void navigate({ to: '/diagnostic' })
    }
  }, [appStateQuery.data, isReady, isReviewRoute, navigate, session])

  useEffect(() => {
    const startedAt = practiceQuery.data?.session.startedAt
    if (startedAt == null) return
    const sync = () => setElapsedMs(Date.now() - startedAt)
    sync()
    const id = window.setInterval(sync, 1000)
    return () => window.clearInterval(id)
  }, [practiceQuery.data?.session.startedAt])

  useEffect(() => {
    questionStartedAtRef.current = Date.now()
  }, [currentIndex])

  useEffect(() => {
    if (isReviewRoute) return
    const practice = practiceQuery.data
    if (practice?.session.status === 'completed') {
      void navigate({ to: '/practice/$sessionId/review', params: { sessionId } })
    }
  }, [isReviewRoute, navigate, practiceQuery.data, sessionId])

  if (isReviewRoute) {
    return <Outlet />
  }

  const answerMutation = useMutation({
    mutationFn: async (selectedOption: string) => {
      const practice = practiceQuery.data
      const currentQuestion = practice?.questions[currentIndex]
      if (practice?.session == null || currentQuestion == null) {
        throw new Error('Pregunta no cargada.')
      }
      return submitPracticeAnswer({
        sessionId: practice.session._id,
        sessionQuestionId: currentQuestion.sessionQuestionId,
        selectedOption,
        responseTimeMs: Date.now() - questionStartedAtRef.current,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: practiceSessionQuery(sessionId).queryKey,
      })
    },
  })

  const clearAnswerMutation = useMutation({
    mutationFn: async () => {
      const practice = practiceQuery.data
      const currentQuestion = practice?.questions[currentIndex]
      if (practice?.session == null || currentQuestion == null) {
        throw new Error('Pregunta no cargada.')
      }
      return clearPracticeAnswer({
        sessionId: practice.session._id,
        sessionQuestionId: currentQuestion.sessionQuestionId,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: practiceSessionQuery(sessionId).queryKey,
      })
    },
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      const practice = practiceQuery.data
      if (practice?.session == null) throw new Error('Práctica no cargada.')
      return completePracticeSession({ sessionId: practice.session._id })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      await navigate({ to: '/practice/$sessionId/review', params: { sessionId } })
    },
  })

  if (!isReady || session == null || appStateQuery.isPending || practiceQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Cargando práctica...</p>
      </div>
    )
  }

  const practice = practiceQuery.data
  if (practice == null) {
    return (
      <StudentAppShell session={session} activeSection="practice">
        <div className="fade-in mx-auto max-w-xl py-12 text-center">
          <h1 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">No encontramos esta práctica</h1>
          <button type="button" className="btn-primary" onClick={() => navigate({ to: '/practice' })}>
            Volver a práctica
          </button>
        </div>
      </StudentAppShell>
    )
  }

  const questions = practice.questions
  const currentQuestion = questions[currentIndex]
  if (currentQuestion == null) {
    return (
      <StudentAppShell session={session} activeSection="practice">
        <div className="fade-in mx-auto max-w-xl py-12 text-center">
          <h1 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">No hay preguntas disponibles</h1>
        </div>
      </StudentAppShell>
    )
  }

  const answeredCount = questions.filter((question) => question.attempt?.selectedOption != null).length
  const selectedOption = currentQuestion.attempt?.selectedOption ?? null
  const isSavingAnswer = answerMutation.isPending || clearAnswerMutation.isPending
  const canFinish = answeredCount === questions.length
  const progress = questions.length === 0 ? 0 : (answeredCount / questions.length) * 100

  return (
    <StudentAppShell
      session={session}
      activeSection="practice"
      mainClassName="student-shell-main-immersive"
    >
      <div className="practice-solve-shell fade-in">
        <header className="practice-solve-topbar" aria-label="Estado de práctica">
          <div className="practice-solve-pill">
            <BookOpen size={18} />
            <span>{getSubjectLabel(currentQuestion.question.subjectId ?? 'sin_asignar')}</span>
          </div>
          <div className="practice-solve-progress">
            <strong>{currentIndex + 1}</strong>
            <span>de {questions.length}</span>
            <div className="practice-solve-progress-track" aria-hidden>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="practice-solve-actions">
            <span className="practice-solve-timer">
              <Timer size={17} />
              {formatElapsed(elapsedMs)}
            </span>
            <button
              type="button"
              className="practice-solve-icon"
              onClick={() => navigate({ to: '/practice' })}
              aria-label="Salir de la práctica"
              title="Salir"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <main className="practice-solve-main">
          <article className="practice-solve-question">
            <MarkdownBlock markdown={currentQuestion.question.bodyMarkdown} />
          </article>

          <div className="practice-solve-options" role="group" aria-label="Opciones de respuesta">
            {currentQuestion.question.options.map((option) => {
              const isSelected = selectedOption === option.label
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={isSavingAnswer || completeMutation.isPending}
                  onClick={() => {
                    if (selectedOption === option.label) {
                      clearAnswerMutation.mutate()
                      return
                    }
                    answerMutation.mutate(option.label)
                  }}
                  className={`practice-solve-option ${isSelected ? 'is-selected' : ''}`}
                >
                  <span className="practice-solve-option-label">{option.label}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <MarkdownBlock markdown={option.bodyMarkdown} />
                  </span>
                  <span className="practice-solve-option-radio" aria-hidden />
                </button>
              )
            })}
          </div>

          {(answerMutation.error || clearAnswerMutation.error || completeMutation.error) ? (
            <div className="stage-alert">
              {answerMutation.error instanceof Error
                ? answerMutation.error.message
                : clearAnswerMutation.error instanceof Error
                  ? clearAnswerMutation.error.message
                : completeMutation.error instanceof Error
                  ? completeMutation.error.message
                  : 'No se pudo guardar el progreso.'}
            </div>
          ) : null}
        </main>

        <footer className="practice-solve-footer">
          <button
            type="button"
            className="stage-finish inline-flex items-center gap-2"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft size={16} />
            Anterior
          </button>
          <div className="practice-solve-dots" aria-label={`${answeredCount} de ${questions.length} respondidas`}>
            {questions.map((question, index) => (
              <button
                key={question.sessionQuestionId}
                type="button"
                className={[
                  'practice-solve-dot',
                  question.attempt?.selectedOption != null ? 'is-answered' : '',
                  index === currentIndex ? 'is-current' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Ir a la pregunta ${index + 1}`}
              />
            ))}
          </div>
          {currentIndex === questions.length - 1 ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={!canFinish || completeMutation.isPending}
              onClick={() => completeMutation.mutate()}
              title={canFinish ? 'Terminar práctica' : 'Responde todas las preguntas para terminar'}
            >
              {completeMutation.isPending ? 'Terminando...' : 'Terminar'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          )}
        </footer>
      </div>
    </StudentAppShell>
  )
}
