import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '@aprendo/convex/api'
import { useStoredStudentSession } from '../lib/student-session.ts'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { session, isReady, saveSession } = useStoredStudentSession()
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const upsertStudentByEmail = useConvexMutation(api.students.upsertStudentByEmail)
  const loginMutation = useMutation({
    mutationFn: async (nextEmail: string) => {
      return upsertStudentByEmail({ email: nextEmail })
    },
    onSuccess: async (student) => {
      saveSession({ studentId: student._id, email: student.email })
      setErrorMessage(null)
      await navigate({ to: '/app' })
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    },
  })

  // If already logged in, show a redirect option
  if (isReady && session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="fade-in w-full max-w-sm text-center">
          <div className="card px-8 py-10">
            <p className="mb-1 text-sm text-[var(--text-secondary)]">
              Sesion activa
            </p>
            <p className="mb-6 text-lg font-semibold text-[var(--text-primary)]">
              {session.email}
            </p>
            <Link
              to="/app"
              className="btn-primary w-full justify-center no-underline"
            >
              Continuar
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="fade-in w-full max-w-sm">
        {/* Back to landing */}
        <div className="mb-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-tertiary)] no-underline transition hover:text-[var(--text-secondary)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Volver
          </Link>
        </div>

        <div className="card px-8 py-10">
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-accent)] bg-[var(--accent-soft)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>

          <h1 className="mb-1 text-center text-xl font-semibold text-[var(--text-primary)]">
            Entra a Aprendo
          </h1>
          <p className="mb-6 text-center text-sm text-[var(--text-tertiary)]">
            Solo necesitas tu correo electronico
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              loginMutation.mutate(email)
            }}
          >
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
                Correo electronico
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
                className="input"
                autoFocus
              />
            </label>

            <button
              type="submit"
              disabled={loginMutation.isPending || email.trim().length === 0}
              className="btn-primary w-full justify-center py-3"
            >
              {loginMutation.isPending ? 'Entrando...' : 'Continuar'}
            </button>
          </form>

          {errorMessage ? (
            <p className="mt-4 text-center text-sm font-medium text-[var(--accent-text)]">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-[var(--text-tertiary)]">
          Acceso simple para la primera fase. Sin contrasena ni verificacion.
        </p>
      </div>
    </div>
  )
}
