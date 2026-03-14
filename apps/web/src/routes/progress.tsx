import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { latestDiagnosticQuery, studentProgressQuery } from '../lib/student-queries'
import { useStoredStudentSession } from '../lib/student-session'
import { getSubjectLabel, getSubtopicLabel } from '../lib/taxonomy'

export const Route = createFileRoute('/progress')({
  component: ProgressPage,
})

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function ProgressPage() {
  const navigate = useNavigate()
  const { session, isReady } = useStoredStudentSession()

  useEffect(() => {
    if (isReady && session == null) {
      void navigate({ to: '/' })
    }
  }, [isReady, navigate, session])

  const progressQuery = useQuery({
    ...studentProgressQuery(session?.studentId ?? ''),
    enabled: session != null,
  })
  const latestDiagnostic = useQuery({
    ...latestDiagnosticQuery(session?.studentId ?? ''),
    enabled: session != null,
  })

  if (!isReady || session == null) {
    return (
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-[2rem] p-6 sm:p-8">
          <p className="island-kicker mb-2">Progreso</p>
          <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            Cargando...
          </h1>
        </section>
      </main>
    )
  }

  if (progressQuery.isPending || latestDiagnostic.isPending) {
    return (
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-[2rem] p-6 sm:p-8">
          <p className="island-kicker mb-2">Progreso</p>
          <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            Preparando tu resumen...
          </h1>
        </section>
      </main>
    )
  }

  const progress = progressQuery.data
  const diagnostic = latestDiagnostic.data
  const overallSummary = progress?.snapshot?.overallSummary
  const subjectAggregates = progress?.subjectAggregates ?? []
  const weakestSubtopics = progress?.weakestSubtopics ?? []

  if (overallSummary == null || diagnostic?.status !== 'completed') {
    return (
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-[2rem] p-6 sm:p-8">
          <p className="island-kicker mb-2">Progreso</p>
          <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            Aun no tienes un diagnostico completado
          </h1>
          <p className="max-w-2xl text-base leading-8 text-[var(--sea-ink-soft)]">
            Tu pagina de progreso aparecera cuando completes el primer
            diagnostico. Ese resultado servira como linea base.
          </p>
          <div className="mt-6">
            <Link
              to="/diagnostic"
              className="rounded-full border border-[rgba(235,122,111,0.28)] bg-[linear-gradient(135deg,#f39b8f,#ea7a6f)] px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-[0_14px_28px_rgba(234,122,111,0.24)] transition hover:-translate-y-0.5"
            >
              Ir al diagnostico
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="page-wrap px-4 py-10">
      <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="island-shell rounded-[2rem] p-6 text-center">
            <p className="island-kicker mb-3">Resultado base</p>
            <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full border-[10px] border-[rgba(235,122,111,0.28)] bg-white text-[3.2rem] font-extrabold text-[var(--sea-ink)] shadow-[0_18px_36px_rgba(23,58,64,0.08)]">
              {Math.round(overallSummary.accuracy * 100)}
            </div>
            <p className="mt-4 mb-0 text-sm leading-7 text-[var(--sea-ink-soft)]">
              {overallSummary.correctCount}
              {' '}
              correctas de
              {' '}
              {overallSummary.questionCount}
              {' '}
              preguntas respondidas.
            </p>
          </section>

          <section className="island-shell rounded-[1.8rem] p-5">
            <p className="island-kicker mb-2">Siguiente paso</p>
            <p className="m-0 text-sm leading-7 text-[var(--sea-ink-soft)]">
              Tu diagnostico ya dejo una primera huella. La siguiente iteracion
              del producto usara estas senales para construir practica guiada.
            </p>
          </section>
        </aside>

        <section className="space-y-6">
          <section className="island-shell rounded-[2rem] p-6 sm:p-8">
            <p className="island-kicker mb-2">Resumen</p>
            <h1 className="display-title m-0 text-4xl font-bold text-[var(--sea-ink)]">
              Progreso inicial de {session.email}
            </h1>
            <p className="mt-3 mb-0 max-w-3xl text-sm leading-8 text-[var(--sea-ink-soft)]">
              Esta vista muestra tu linea base despues del diagnostico. Todavia
              no hay practica adaptativa, asi que interpretamos el resultado con
              prudencia, especialmente en subtemas con poca evidencia.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subjectAggregates.map((aggregate) => (
              <article
                key={aggregate._id}
                className="feature-card rounded-[1.6rem] border border-[rgba(23,58,64,0.12)] p-5"
              >
                <p className="island-kicker mb-2">Materia</p>
                <h2 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
                  {getSubjectLabel(aggregate.subjectId)}
                </h2>
                <p className="mt-4 mb-1 text-3xl font-bold text-[color:#b4534a]">
                  {formatPercent(aggregate.accuracy)}
                </p>
                <p className="m-0 text-sm leading-7 text-[var(--sea-ink-soft)]">
                  {aggregate.correctCount}
                  {' '}
                  correctas de
                  {' '}
                  {aggregate.attemptCount}
                  {' '}
                  intentos.
                </p>
                <p className="mt-4 mb-0 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--kicker)]">
                  Evidencia {aggregate.evidenceLevel}
                </p>
              </article>
            ))}
          </section>

          <section className="island-shell rounded-[2rem] p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="island-kicker mb-2">Alertas tempranas</p>
                <h2 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
                  Subtemas que merecen atencion
                </h2>
              </div>
              <Link
                to="/diagnostic"
                className="rounded-full border border-[rgba(23,58,64,0.12)] bg-white px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5"
              >
                Repetir diagnostico
              </Link>
            </div>

            {weakestSubtopics.length === 0 ? (
              <p className="m-0 text-sm leading-7 text-[var(--sea-ink-soft)]">
                Aun no hay suficiente evidencia para senalar subtemas concretos.
              </p>
            ) : (
              <div className="space-y-3">
                {weakestSubtopics.map((aggregate) => (
                  <article
                    key={aggregate._id}
                    className="rounded-[1.4rem] border border-[rgba(23,58,64,0.1)] bg-white/70 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
                          {getSubtopicLabel(aggregate.subtopicId ?? 'sin_subtema')}
                        </p>
                        <p className="mt-1 mb-0 text-sm text-[var(--sea-ink-soft)]">
                          {getSubjectLabel(aggregate.subjectId)}
                        </p>
                      </div>
                      <div className="text-sm text-[var(--sea-ink-soft)]">
                        <strong className="text-[color:#b4534a]">
                          {formatPercent(aggregate.accuracy)}
                        </strong>
                        {' '}
                        de acierto
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  )
}
