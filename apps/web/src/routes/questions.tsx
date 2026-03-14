import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '@aprendo/convex/api'
import MarkdownBlock from '../components/MarkdownBlock'

type QuestionsSearch = {
  pdfUploadId?: string
  sequence?: number
}

const pdfUploadsQuery = () => convexQuery(api.pdfs.listPdfUploads, { limit: 50 })

const questionBrowserQuery = (pdfUploadId: string, sequence: number) =>
  convexQuery(api.pdfs.getQuestionBrowser, {
    pdfUploadId: pdfUploadId as never,
    sequence,
  })

export const Route = createFileRoute('/questions')({
  validateSearch: (search: Record<string, unknown>): QuestionsSearch => ({
    pdfUploadId:
      typeof search.pdfUploadId === 'string' ? search.pdfUploadId : undefined,
    sequence:
      typeof search.sequence === 'number'
        ? search.sequence
        : typeof search.sequence === 'string'
          ? Number(search.sequence)
          : undefined,
  }),
  loaderDeps: ({ search }) => ({
    pdfUploadId: search.pdfUploadId,
    sequence: search.sequence ?? 1,
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient.ensureQueryData(pdfUploadsQuery())
    if (deps.pdfUploadId) {
      await queryClient.ensureQueryData(
        questionBrowserQuery(deps.pdfUploadId, deps.sequence),
      )
    }
  },
  component: QuestionsPage,
  pendingComponent: QuestionsPending,
})

function QuestionsPage() {
  const search = Route.useSearch()
  const { data: uploads } = useSuspenseQuery(pdfUploadsQuery())
  const selectedUploadId = search.pdfUploadId
  const selectedSequence = search.sequence ?? 1
  const completedUploads = uploads.filter((upload) => upload.questionCount != null && upload.questionCount > 0)
  const defaultUploadId =
    selectedUploadId ?? completedUploads[0]?._id

  const browserQuery = defaultUploadId
    ? useSuspenseQuery(
        questionBrowserQuery(defaultUploadId, selectedSequence),
      )
    : null

  const browser = browserQuery?.data ?? null

  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-[2rem] p-6 sm:p-8">
        <p className="island-kicker mb-2">Questions browser</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Browse saved questions
        </h1>
        <p className="max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          Pick an uploaded PDF and navigate the stored questions one by one.
        </p>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          {completedUploads.length === 0 ? (
            <section className="island-shell rounded-2xl p-5">
              <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
                No processed question sets yet.
              </p>
            </section>
          ) : (
            completedUploads.map((upload) => (
              <Link
                key={upload._id}
                to="/questions"
                search={{
                  pdfUploadId: upload._id,
                  sequence: 1,
                }}
                className="island-shell block rounded-2xl p-5 no-underline"
                activeProps={{
                  className:
                    'island-shell block rounded-2xl p-5 no-underline border-[rgba(50,143,151,0.35)]',
                }}
              >
                <p className="island-kicker mb-2">Question set</p>
                <h2 className="m-0 text-base font-semibold text-[var(--sea-ink)]">
                  {upload.fileName}
                </h2>
                <p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
                  {upload.questionCount} questions
                </p>
              </Link>
            ))
          )}
        </aside>

        <section className="space-y-4">
          {!browser || browser.question == null ? (
            <section className="island-shell rounded-2xl p-6">
              <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
                Select a processed PDF to start browsing questions.
              </p>
            </section>
          ) : (
            <>
              <section className="island-shell rounded-2xl p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="island-kicker mb-2">Current question</p>
                    <h2 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
                      {browser.upload.fileName}
                    </h2>
                    <p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
                      Question {browser.currentSequence} of {browser.totalQuestions}
                      {' · '}
                      Original number {browser.question.questionNumber}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/questions"
                      search={{
                        pdfUploadId: browser.upload._id,
                        sequence: Math.max(1, browser.currentSequence - 1),
                      }}
                      className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
                    >
                      Previous
                    </Link>
                    <Link
                      to="/questions"
                      search={{
                        pdfUploadId: browser.upload._id,
                        sequence: Math.min(
                          browser.totalQuestions,
                          browser.currentSequence + 1,
                        ),
                      }}
                      className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]"
                    >
                      Next
                    </Link>
                  </div>
                </div>
              </section>

              <section className="island-shell rounded-2xl p-6">
                <p className="island-kicker mb-4">Question body</p>
                <MarkdownBlock markdown={browser.question.bodyMarkdown} />
              </section>

              <section className="grid gap-4">
                {browser.question.options.map((option) => (
                  <article
                    key={option.label}
                    className="feature-card rounded-[1.6rem] border border-[rgba(23,58,64,0.14)] p-5"
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(50,143,151,0.28)] bg-[rgba(79,184,178,0.16)] text-sm font-extrabold text-[var(--lagoon-deep)]">
                        {option.label}
                      </span>
                      <p className="island-kicker m-0">Answer option</p>
                    </div>
                    {option.bodyMarkdown ? (
                      <div
                        className={
                          option.bodyMarkdown.trim().startsWith('![')
                            ? 'rounded-[1.2rem] border border-[var(--line)] bg-[color:color-mix(in_oklab,var(--surface-strong)_88%,white_12%)] p-3'
                            : ''
                        }
                      >
                        <MarkdownBlock markdown={option.bodyMarkdown} />
                      </div>
                    ) : (
                      <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
                        Empty option body.
                      </p>
                    )}
                  </article>
                ))}
              </section>
            </>
          )}
        </section>
      </section>
    </main>
  )
}

function QuestionsPending() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-[2rem] p-6 sm:p-8">
        <p className="island-kicker mb-2">Questions browser</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Loading questions...
        </h1>
      </section>
    </main>
  )
}
