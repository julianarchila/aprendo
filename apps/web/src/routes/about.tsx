import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">About</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          An AI-assisted ICFES prep platform in its first scaffold.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          Aprendo starts with a lean monorepo: TanStack Start for the student
          app, a shared database package for future Drizzle models, and a
          dedicated ingestion package reserved for OCR and normalization work.
        </p>
      </section>
    </main>
  )
}
