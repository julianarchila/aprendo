import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '@aprendo/convex/api'

const demoQuery = () =>
  convexQuery(api.myFunctions.myQuery, {
    first: 7,
    second: 'hello from TanStack Start',
  })

export const Route = createFileRoute('/')({
  component: DummyPage,
  pendingComponent: DummyPending,
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(demoQuery())
  },
})

function DummyPage() {
  const { data } = useSuspenseQuery(demoQuery())
  const [mutationResult, setMutationResult] = useState<null | {
    echoedNumber: number
    echoedText: string
    message: string
  }>(null)
  const mutationFn = useConvexMutation(api.myFunctions.myMutation)
  const mutation = useMutation({
    mutationFn,
    onSuccess: (result) => {
      setMutationResult(result)
    },
  })

  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />
        <p className="island-kicker mb-3">Convex smoke test</p>
        <h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
          TanStack Start + Convex are wired end to end.
        </h1>
        <p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
          This page keeps one query and one mutation as a tight integration
          check while the upload pipeline lives on the admin page.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/upload-pdfs"
            className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]"
          >
            Open upload admin
          </Link>
          <button
            type="button"
            onClick={() => {
              mutation.mutate({
                first: 42,
                second: 'hello from a dumb mutation',
              })
            }}
            disabled={mutation.isPending}
            className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? 'Running mutation...' : 'Run dumb mutation'}
          </button>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <article className="feature-card rounded-2xl p-5">
          <p className="island-kicker mb-2">Query message</p>
          <p className="m-0 text-base font-semibold text-[var(--sea-ink)]">
            {data.message}
          </p>
        </article>
        <article className="feature-card rounded-2xl p-5">
          <p className="island-kicker mb-2">Echoed number</p>
          <p className="m-0 text-3xl font-bold text-[var(--sea-ink)]">
            {data.echoedNumber}
          </p>
        </article>
        <article className="feature-card rounded-2xl p-5">
          <p className="island-kicker mb-2">Echoed text</p>
          <p className="m-0 text-base font-semibold text-[var(--sea-ink)]">
            {data.echoedText}
          </p>
        </article>
      </section>

      {mutationResult ? (
        <section className="island-shell mt-8 rounded-2xl p-6">
          <p className="island-kicker mb-2">Last mutation result</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <article className="feature-card rounded-2xl p-5">
              <p className="island-kicker mb-2">Message</p>
              <p className="m-0 text-base font-semibold text-[var(--sea-ink)]">
                {mutationResult.message}
              </p>
            </article>
            <article className="feature-card rounded-2xl p-5">
              <p className="island-kicker mb-2">Echoed number</p>
              <p className="m-0 text-3xl font-bold text-[var(--sea-ink)]">
                {mutationResult.echoedNumber}
              </p>
            </article>
            <article className="feature-card rounded-2xl p-5">
              <p className="island-kicker mb-2">Echoed text</p>
              <p className="m-0 text-base font-semibold text-[var(--sea-ink)]">
                {mutationResult.echoedText}
              </p>
            </article>
          </div>
        </section>
      ) : null}
    </main>
  )
}

function DummyPending() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-[2rem] p-6 sm:p-8">
        <p className="island-kicker mb-2">Convex smoke test</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Loading query...
        </h1>
      </section>
    </main>
  )
}
