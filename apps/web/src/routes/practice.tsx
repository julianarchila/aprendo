import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router'
import { BookOpenCheck, CheckCircle2, Play, RotateCw } from 'lucide-react'
import { useEffect } from 'react'
import { api } from '@aprendo/convex/api'
import { StudentAppShell } from '../components/StudentAppShell.tsx'
import { activePracticeSessionQuery, studentAppStateQuery, studentPracticeSessionsQuery } from '../lib/student-queries.ts'
import { useCurrentStudent } from '../lib/student-session.ts'

export const Route = createFileRoute('/practice')({
  component: PracticeStartPage,
})

function PracticeStartPage() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { session, isReady } = useCurrentStudent()
  const isPracticeIndex = pathname === '/practice'
  const appStateQuery = useQuery({
    ...studentAppStateQuery(session?.studentId),
    enabled: isPracticeIndex && isReady && session != null,
  })
  const activePracticeQuery = useQuery({
    ...activePracticeSessionQuery(session?.studentId),
    enabled: isPracticeIndex && isReady && session != null,
  })
  const practiceSessionsQuery = useQuery({
    ...studentPracticeSessionsQuery(session?.studentId),
    enabled: isPracticeIndex && isReady && session != null,
  })
  const createPracticeSession = useConvexMutation(api.practice.createOrGetPracticeSession)
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      if (session == null) throw new Error('No has iniciado sesión.')
      return createPracticeSession({ studentId: session.studentId })
    },
    onSuccess: async (sessionId) => {
      await navigate({ to: '/practice/$sessionId', params: { sessionId } })
    },
  })

  useEffect(() => {
    if (!isPracticeIndex) return
    if (isReady && session == null) {
      void navigate({ to: '/login' })
    }
  }, [isPracticeIndex, isReady, navigate, session])

  useEffect(() => {
    if (!isPracticeIndex) return
    if (!isReady || session == null || appStateQuery.data == null) return
    if (!appStateQuery.data.hasCompletedDiagnostic) {
      void navigate({ to: '/diagnostic' })
    }
  }, [appStateQuery.data, isPracticeIndex, isReady, navigate, session])

  if (!isPracticeIndex) {
    return <Outlet />
  }

  if (
    !isReady
    || session == null
    || appStateQuery.isPending
    || activePracticeQuery.isPending
    || practiceSessionsQuery.isPending
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Cargando...</p>
      </div>
    )
  }

  const activePractice = activePracticeQuery.data ?? null
  const practiceSessions = practiceSessionsQuery.data ?? []
  const completedSessions = practiceSessions.filter((practiceSession) => practiceSession.status === 'completed')

  return (
    <StudentAppShell
      session={session}
      activeSection="practice"
      mainClassName="student-shell-main-immersive"
    >
      <div className="practice-start-shell fade-in">
        <section className="practice-start-panel">
          <div className="practice-start-mark" aria-hidden>
            <BookOpenCheck size={24} />
          </div>
          <p className="kicker mb-2">Practica recomendada</p>
          <h1 className="practice-start-title">Empieza cuando estés listo</h1>
          <p className="practice-start-copy">
            {activePractice == null
              ? 'Resolverás una sesión enfocada sin ver respuestas ni retroalimentación. Al terminar pasarás a una pantalla de revisión con resultados, explicaciones y tutor.'
              : 'Tienes una práctica activa. Continúa donde quedaste antes de crear una sesión nueva.'}
          </p>
          {activePractice == null ? (
            <button
              type="button"
              disabled={createSessionMutation.isPending}
              onClick={() => createSessionMutation.mutate()}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Play size={16} />
              {createSessionMutation.isPending ? 'Preparando...' : 'Iniciar práctica'}
            </button>
          ) : (
            <Link
              to="/practice/$sessionId"
              params={{ sessionId: activePractice._id }}
              className="btn-primary inline-flex items-center gap-2 no-underline"
            >
              <RotateCw size={16} />
              Continuar práctica
            </Link>
          )}
          {createSessionMutation.error ? (
            <div className="stage-alert mt-5">
              {createSessionMutation.error instanceof Error
                ? createSessionMutation.error.message
              : 'No se pudo crear la práctica.'}
            </div>
          ) : null}

          {practiceSessions.length > 0 ? (
            <div className="practice-session-list">
              <div className="practice-session-list-header">
                <p className="kicker">Sesiones recientes</p>
              </div>
              {activePractice != null ? (
                <Link
                  to="/practice/$sessionId"
                  params={{ sessionId: activePractice._id }}
                  className="practice-session-row is-active"
                >
                  <span className="practice-session-row-icon">
                    <RotateCw size={15} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <strong>Práctica en curso</strong>
                    <small>{activePractice.questionCount} preguntas</small>
                  </span>
                  <span className="practice-session-row-action">Continuar</span>
                </Link>
              ) : null}

              {completedSessions.slice(0, 5).map((practiceSession) => (
                <Link
                  key={practiceSession._id}
                  to="/practice/$sessionId/review"
                  params={{ sessionId: practiceSession._id }}
                  className="practice-session-row"
                >
                  <span className="practice-session-row-icon">
                    <CheckCircle2 size={15} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <strong>
                      {practiceSession.summary
                        ? `${practiceSession.summary.correctCount}/${practiceSession.summary.questionCount} correctas`
                        : 'Práctica completada'}
                    </strong>
                    <small>{new Date(practiceSession.startedAt).toLocaleDateString('es-CO')}</small>
                  </span>
                  <span className="practice-session-row-action">Revisar</span>
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </StudentAppShell>
  )
}
