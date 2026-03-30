import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { DiagnosticExamPage } from '../components/DiagnosticExamPage.tsx'
import ThemeToggle from '../components/ThemeToggle.tsx'
import { studentAppStateQuery } from '../lib/student-queries.ts'
import { useStoredStudentSession } from '../lib/student-session.ts'

export const Route = createFileRoute('/diagnostic')({
  component: DiagnosticPage,
})

function DiagnosticPage() {
  const navigate = useNavigate()
  const { session, isReady } = useStoredStudentSession()
  const appStateQuery = useQuery({
    ...studentAppStateQuery(session?.studentId),
    enabled: isReady && session != null,
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

  if (!isReady || session == null || appStateQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-sm text-[var(--text-tertiary)]">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="diagnostic-shell">
      <header className="diagnostic-topbar">
        <div className="diagnostic-topbar-inner">
          <Link
            to="/"
            className="student-brand no-underline"
          >
            <div className="student-brand-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="student-brand-copy">
              <span className="student-brand-title">Aprendo</span>
              <span className="student-brand-subtitle">Onboarding diagnostico</span>
            </div>
          </Link>

          <div className="diagnostic-topbar-actions">
            <div className="student-pill">Diagnostico inicial</div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="diagnostic-shell-main">
        <section className="diagnostic-intro">
          <p className="kicker">Tu punto de partida</p>
          <h1 className="diagnostic-intro-title">Primero medimos, despues practicamos</h1>
          <p className="diagnostic-intro-copy">
            Esta evaluacion aparece una sola vez al iniciar. No hay tutor ni ayudas durante el diagnostico;
            cuando termines, entraras directamente a practica y progreso.
          </p>
        </section>

        <DiagnosticExamPage session={session} />
      </main>
    </div>
  )
}
