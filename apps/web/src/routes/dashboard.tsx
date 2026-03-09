import { createFileRoute } from '@tanstack/react-router'
import { getDashboardSnapshot } from '../lib/dashboard-data'

export const Route = createFileRoute('/dashboard')({
  loader: async () => getDashboardSnapshot(),
  component: DashboardPage,
})

function DashboardPage() {
  const data = Route.useLoaderData()

  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-[2rem] p-6 sm:p-8">
        <p className="island-kicker mb-2">Student dashboard</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Placeholder diagnostic workspace
        </h1>
        <p className="max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          This route proves the initial server boundary. The page loads
          placeholder data from a server function that imports `@aprendo/db`.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="feature-card rounded-2xl p-5">
            <p className="island-kicker mb-2">Questions</p>
            <p className="m-0 text-3xl font-bold text-[var(--sea-ink)]">
              {data.questionCount}
            </p>
          </article>
          <article className="feature-card rounded-2xl p-5">
            <p className="island-kicker mb-2">Next step</p>
            <p className="m-0 text-base font-semibold text-[var(--sea-ink)]">
              {data.nextStep}
            </p>
          </article>
          <article className="feature-card rounded-2xl p-5">
            <p className="island-kicker mb-2">Featured topic</p>
            <p className="m-0 text-base font-semibold text-[var(--sea-ink)]">
              {data.featuredTopic}
            </p>
          </article>
        </div>
      </section>
    </main>
  )
}
