import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth')({
  component: AuthPage,
})

function AuthPage() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell mx-auto max-w-xl rounded-[2rem] p-6 sm:p-8">
        <p className="island-kicker mb-2">Dummy auth</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Placeholder sign in
        </h1>
        <p className="mb-8 text-base leading-8 text-[var(--sea-ink-soft)]">
          This form is intentionally static. It exists only to reserve the auth
          entrypoint in the initial project structure.
        </p>

        <form className="space-y-4">
          <label className="block text-sm font-semibold text-[var(--sea-ink)]">
            Email
            <input
              type="email"
              placeholder="student@example.com"
              className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-[var(--sea-ink)] outline-none"
            />
          </label>

          <label className="block text-sm font-semibold text-[var(--sea-ink)]">
            Password
            <input
              type="password"
              placeholder="********"
              className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-[var(--sea-ink)] outline-none"
            />
          </label>

          <button
            type="button"
            className="w-full rounded-2xl border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-3 text-sm font-semibold text-[var(--lagoon-deep)]"
          >
            Continue
          </button>
        </form>
      </section>
    </main>
  )
}
