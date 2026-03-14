import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '@aprendo/convex/api'
import {
  clearStoredStudentSession,
  useStoredStudentSession,
} from '../lib/student-session'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()
  const { session, isReady, saveSession, clearSession } = useStoredStudentSession()
  const [email, setEmail] = useState(session?.email ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const upsertStudentByEmail = useConvexMutation(api.students.upsertStudentByEmail)
  const loginMutation = useMutation({
    mutationFn: async (nextEmail: string) => {
      return upsertStudentByEmail({
        email: nextEmail,
      })
    },
    onSuccess: async (student) => {
      saveSession({
        studentId: student._id,
        email: student.email,
      })
      setErrorMessage(null)
      await navigate({ to: '/diagnostic' })
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    },
  })

  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rise-in relative overflow-hidden rounded-[2.2rem] px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -left-12 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.24),transparent_68%)]" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(235,122,111,0.16),transparent_70%)]" />
        <p className="island-kicker mb-3">ICFES prep</p>
        <h1 className="display-title mb-4 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
          Diagnostico primero. Progreso claro despues.
        </h1>
        <p className="max-w-2xl text-base leading-8 text-[var(--sea-ink-soft)] sm:text-lg">
          Aprendo convierte bancos de preguntas ICFES en un flujo digital de
          diagnostico y seguimiento. En esta primera etapa no hay tutor ni
          practica adaptativa todavia: la meta es medir bien tu punto de
          partida.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
          <section className="rounded-[1.8rem] border border-[var(--line)] bg-white/60 p-6 shadow-[0_18px_36px_rgba(23,58,64,0.08)] backdrop-blur">
            <p className="island-kicker mb-3">Acceso rapido</p>
            {isReady && session ? (
              <>
                <h2 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
                  Bienvenido de nuevo
                </h2>
                <p className="mt-3 mb-6 text-sm leading-7 text-[var(--sea-ink-soft)]">
                  Sesion local activa para
                  {' '}
                  <strong>{session.email}</strong>
                  . Puedes continuar tu diagnostico o revisar tu progreso actual.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/diagnostic"
                    className="rounded-full border border-[rgba(235,122,111,0.26)] bg-[rgba(235,122,111,0.14)] px-5 py-2.5 text-sm font-semibold text-[color:#b4534a] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(235,122,111,0.2)]"
                  >
                    Ir al diagnostico
                  </Link>
                  <Link
                    to="/progress"
                    className="rounded-full border border-[rgba(23,58,64,0.18)] bg-white/70 px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5"
                  >
                    Ver progreso
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      clearStoredStudentSession()
                      clearSession()
                      setEmail('')
                    }}
                    className="rounded-full border border-[rgba(23,58,64,0.12)] bg-transparent px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink-soft)] transition hover:border-[rgba(23,58,64,0.22)] hover:text-[var(--sea-ink)]"
                  >
                    Cambiar correo
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
                  Entra solo con tu correo
                </h2>
                <p className="mt-3 mb-6 text-sm leading-7 text-[var(--sea-ink-soft)]">
                  Este acceso es deliberadamente simple para la primera fase del
                  producto. No hay contrasena, OTP ni magic links todavia.
                </p>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    loginMutation.mutate(email)
                  }}
                >
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[var(--sea-ink)]">
                      Correo electronico
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value)
                      }}
                      placeholder="tu@correo.com"
                      className="w-full rounded-[1.2rem] border border-[var(--line)] bg-white px-4 py-3 text-base text-[var(--sea-ink)] outline-none transition focus:border-[rgba(235,122,111,0.38)] focus:ring-4 focus:ring-[rgba(235,122,111,0.14)]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={loginMutation.isPending || email.trim().length === 0}
                    className="rounded-full border border-[rgba(235,122,111,0.28)] bg-[linear-gradient(135deg,#f39b8f,#ea7a6f)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(234,122,111,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loginMutation.isPending ? 'Entrando...' : 'Comenzar'}
                  </button>
                </form>
                {errorMessage ? (
                  <p className="mt-4 mb-0 text-sm font-semibold text-[color:#b4534a]">
                    {errorMessage}
                  </p>
                ) : null}
              </>
            )}
          </section>

          <section className="space-y-4">
            <article className="feature-card rounded-[1.6rem] border border-[rgba(23,58,64,0.12)] p-5">
              <p className="island-kicker mb-2">Que incluye esta fase</p>
              <ul className="m-0 list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--sea-ink-soft)]">
                <li>Diagnostico balanceado por areas del ICFES</li>
                <li>Seguimiento inicial por materia y subtema</li>
                <li>Banco de preguntas enriquecido desde PDFs</li>
              </ul>
            </article>
            <article className="feature-card rounded-[1.6rem] border border-[rgba(23,58,64,0.12)] p-5">
              <p className="island-kicker mb-2">Fuera de alcance por ahora</p>
              <ul className="m-0 list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--sea-ink-soft)]">
                <li>Tutor con chat</li>
                <li>Practica adaptativa</li>
                <li>Admin avanzado de contenido</li>
              </ul>
            </article>
          </section>
        </div>
      </section>
    </main>
  )
}
