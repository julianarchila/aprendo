import { Link, useNavigate } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle.tsx'
import { type StoredStudentSession, useStoredStudentSession } from '../lib/student-session.ts'

type StudentSection = 'practice' | 'progress'

export function StudentAppShell({
  session,
  activeSection,
  topBarSupplement,
  mainClassName,
  children,
}: {
  session: StoredStudentSession
  activeSection: StudentSection
  topBarSupplement?: React.ReactNode
  mainClassName?: string
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const { clearSession } = useStoredStudentSession()

  return (
    <div className="student-shell">
      <header className="student-topbar">
        <div className="student-topbar-inner">
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
              <span className="student-brand-subtitle">Preparacion Saber 11</span>
            </div>
          </Link>

          <nav className="student-topnav" aria-label="Navegacion principal">
            <Link
              to="/practice"
              className={`student-topnav-item ${activeSection === 'practice' ? 'is-active' : ''}`}
            >
              Practica
            </Link>
            <Link
              to="/progress"
              className={`student-topnav-item ${activeSection === 'progress' ? 'is-active' : ''}`}
            >
              Progreso
            </Link>
          </nav>

          <div className="student-topbar-actions">
            <div className="student-session-identity">
              <span className="student-session-label">Sesion</span>
              <strong>{session.email}</strong>
            </div>
            {topBarSupplement}
            <ThemeToggle />
            <button
              type="button"
              onClick={() => {
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

      <main className={['student-shell-main', mainClassName].filter(Boolean).join(' ')}>
        {children}
      </main>
    </div>
  )
}
