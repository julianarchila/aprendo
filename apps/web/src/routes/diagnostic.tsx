import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '@aprendo/convex/api'
import { SessionSolve } from '../components/SessionSolve.tsx'
import ThemeToggle from '../components/ThemeToggle.tsx'
import { studentAppStateQuery } from '../lib/student-queries.ts'
import { useCurrentStudent } from '../lib/student-session.ts'

export const Route = createFileRoute('/diagnostic')({
  component: DiagnosticPage,
})

function DiagnosticPage() {
  const navigate = useNavigate()
  const { session, isReady } = useCurrentStudent()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [hasTriedCreate, setHasTriedCreate] = useState(false)

  const appStateQuery = useQuery({
    ...studentAppStateQuery(session?.studentId),
    enabled: isReady && session != null,
  })

  const createSession = useConvexMutation(api.sessions.createSession)
  const createMutation = useMutation({
    mutationFn: async (studentId: string) =>
      createSession({ studentId: studentId as never, kind: 'diagnostic' }),
    onMutate: () => setHasTriedCreate(true),
    onSuccess: (createdId) => setSessionId(createdId),
  })

  useEffect(() => {
    if (isReady && session == null) {
      void navigate({ to: '/login' })
    }
  }, [isReady, navigate, session])

  useEffect(() => {
    if (!isReady || session == null || appStateQuery.data == null) return
    if (appStateQuery.data.hasCompletedDiagnostic) {
      void navigate({ to: '/practice' })
    }
  }, [appStateQuery.data, isReady, navigate, session])

  useEffect(() => {
    if (session == null || sessionId != null || createMutation.isPending || hasTriedCreate) return
    if (appStateQuery.data?.hasCompletedDiagnostic) return
    createMutation.mutate(session.studentId)
  }, [appStateQuery.data, createMutation, hasTriedCreate, session, sessionId])

  if (!isReady || session == null || appStateQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="diagnostic-shell">
      <header className="diagnostic-topbar">
        <div className="diagnostic-topbar-inner">
          <Link to="/" className="student-brand no-underline">
            <div className="student-brand-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="student-brand-copy">
              <span className="student-brand-title">Aprendo</span>
              <span className="student-brand-subtitle">Diagnóstico inicial</span>
            </div>
          </Link>

          <div className="diagnostic-topbar-actions">
            <div className="student-pill">Sin tutor · medimos tu base</div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="diagnostic-solve-main">
        {createMutation.error && sessionId == null ? (
          <div className="fade-in mx-auto max-w-xl py-12 text-center">
            <h2 className="mb-2 text-xl font-semibold text-[var(--text-primary)]">
              No pudimos crear tu diagnóstico
            </h2>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'La creación del diagnóstico falló.'}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                createMutation.reset()
                setHasTriedCreate(false)
              }}
            >
              Reintentar
            </button>
          </div>
        ) : sessionId == null ? (
          <div className="solve-loading">
            <p>Preparando tu evaluación…</p>
          </div>
        ) : (
          <SessionSolve
            sessionId={sessionId}
            onExit={() => navigate({ to: '/' })}
            onCompleted={(completedId) =>
              navigate({ to: '/practice/$sessionId/review', params: { sessionId: completedId } })
            }
          />
        )}
      </main>
    </div>
  )
}
