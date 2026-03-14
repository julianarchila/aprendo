import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '@aprendo/convex/api'

const convexDemoQuery = () =>
  convexQuery(api.myFunctions.myQuery, {
    first: 7,
    second: 'hello from TanStack Start',
  })

export const Route = createFileRoute('/convex-demo')({
  component: ConvexDemoPage,
  pendingComponent: ConvexDemoPending,
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(convexDemoQuery())
  },
})

function ConvexDemoPage() {
  const { data } = useSuspenseQuery(convexDemoQuery())
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
      <section className="island-shell rounded-[2rem] p-6 sm:p-8">
        <p className="island-kicker mb-2">Convex integration</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Dummy Convex query page
        </h1>
        <p className="max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          This route calls the public query in
          {' '}
          <code>packages/convex/src/myFunctions.ts</code>
          {' '}
          through TanStack Query.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="feature-card rounded-2xl p-5">
            <p className="island-kicker mb-2">Message</p>
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
        </div>

        <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white/50 p-5">
          <p className="island-kicker mb-2">Mutation</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                mutation.mutate({
                  first: 42,
                  second: 'hello from a dumb mutation',
                })
              }}
              disabled={mutation.isPending}
              className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? 'Running mutation...' : 'Run dumb mutation'}
            </button>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              Calls
              {' '}
              <code>myFunctions.myMutation</code>
              {' '}
              from the browser.
            </p>
          </div>

          {mutationResult ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <article className="feature-card rounded-2xl p-5">
                <p className="island-kicker mb-2">Mutation message</p>
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
          ) : null}
        </div>
      </section>
    </main>
  )
}

function ConvexDemoPending() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-[2rem] p-6 sm:p-8">
        <p className="island-kicker mb-2">Convex integration</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Loading query...
        </h1>
      </section>
    </main>
  )
}
