import { useConvexMutation } from '@convex-dev/react-query'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '@aprendo/convex/api'
import MarkdownBlock from '../components/MarkdownBlock.tsx'
import { pdfUploadsQuery, questionBrowserQuery } from '../lib/pdf-queries.ts'
import { uploadPdfToConvex } from '../lib/pdf-upload.ts'
import ThemeToggle from '../components/ThemeToggle.tsx'

type AdminTab = 'uploads' | 'questions'

type AdminSearch = {
  tab?: AdminTab
  pdfUploadId?: string
  sequence?: number
}

export const Route = createFileRoute('/admin')({
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    tab: search.tab === 'questions' ? 'questions' : undefined,
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
    tab: search.tab ?? 'uploads',
    pdfUploadId: search.pdfUploadId,
    sequence: search.sequence ?? 1,
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient.ensureQueryData(pdfUploadsQuery(50))
    if (deps.tab === 'questions' && deps.pdfUploadId) {
      await queryClient.ensureQueryData(
        questionBrowserQuery(deps.pdfUploadId, deps.sequence),
      )
    }
  },
  component: AdminPage,
  pendingComponent: AdminPending,
})

function AdminPending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <p className="text-sm text-[var(--text-tertiary)]">Cargando admin...</p>
    </div>
  )
}

function AdminPage() {
  const search = Route.useSearch()
  const activeTab: AdminTab = search.tab ?? 'uploads'

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Top bar */}
      <header className="border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="page-container-wide flex flex-wrap items-center justify-between gap-3 py-3">
          {/* Brand */}
          <Link
            to="/"
            className="flex items-center gap-2.5 text-[var(--text-primary)] no-underline"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-accent)] bg-[var(--accent-soft)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold">Aprendo</span>
              <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">Admin</span>
            </div>
          </Link>

          {/* Center tabs */}
          <nav className="tab-nav">
            <Link
              to="/admin"
              search={{}}
              className={`tab-item ${activeTab === 'uploads' ? 'is-active' : ''}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
              Upload PDFs
            </Link>
            <Link
              to="/admin"
              search={{ tab: 'questions' }}
              className={`tab-item ${activeTab === 'questions' ? 'is-active' : ''}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Questions
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/app"
              className="btn-ghost text-xs no-underline"
            >
              App
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="page-container-wide px-4 py-8">
        {activeTab === 'uploads' ? <UploadsTab /> : <QuestionsTab search={search} />}
      </main>
    </div>
  )
}

/* ─── Uploads Tab ─── */

function UploadsTab() {
  const queryClient = useQueryClient()
  const { data: uploads } = useSuspenseQuery(pdfUploadsQuery(50))
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const generateUploadUrl = useConvexMutation(api.pdfs.generatePdfUploadUrl)
  const createPdfUpload = useConvexMutation(api.pdfs.createPdfUpload)
  const retryPdfUpload = useConvexMutation(api.pdfs.retryPdfUpload)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return uploadPdfToConvex({ file, generateUploadUrl, createPdfUpload })
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    },
    onSuccess: async () => {
      setErrorMessage(null)
      setSelectedFile(null)
      await queryClient.invalidateQueries({ queryKey: pdfUploadsQuery().queryKey })
    },
  })

  const retryMutation = useMutation({
    mutationFn: async (pdfUploadId: string) => {
      await retryPdfUpload({ pdfUploadId: pdfUploadId as never })
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    },
  })

  return (
    <div className="fade-in mx-auto max-w-3xl">
      {/* Upload form */}
      <div className="card mb-8 p-6">
        <h2 className="mb-1 text-lg font-semibold text-[var(--text-primary)]">
          Upload a PDF
        </h2>
        <p className="mb-5 text-sm text-[var(--text-secondary)]">
          Each upload is processed through OCR, question extraction, and enrichment.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="block flex-1 text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-[var(--radius-pill)] file:border file:border-[var(--border)] file:bg-[var(--bg-inset)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--text-primary)] file:cursor-pointer"
          />
          <button
            type="button"
            disabled={selectedFile == null || uploadMutation.isPending}
            onClick={() => selectedFile && uploadMutation.mutate(selectedFile)}
            className="btn-primary"
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload PDF'}
          </button>
        </div>

        {selectedFile ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            Ready: <strong>{selectedFile.name}</strong> ({Math.ceil(selectedFile.size / 1024)} KB)
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-3 text-sm font-medium text-[var(--accent-text)]">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {/* Upload list */}
      <div className="space-y-3">
        {uploads.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">No PDFs uploaded yet.</p>
          </div>
        ) : (
          uploads.map((upload) => (
            <div key={upload._id} className="card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
                    {upload.fileName}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`chip ${upload.status === 'completed' ? 'chip-success' : upload.status === 'failed' ? 'chip-accent' : ''}`}>
                      {upload.status}
                    </span>
                    <span className="chip">{Math.ceil(upload.sizeBytes / 1024)} KB</span>
                    {upload.questionCount != null ? <span className="chip">{upload.questionCount} questions</span> : null}
                    {upload.answerCompletedCount != null ? <span className="chip">{upload.answerCompletedCount} answers</span> : null}
                    {upload.taxonomyCompletedCount != null ? <span className="chip">{upload.taxonomyCompletedCount} tagged</span> : null}
                    {upload.diagnosticEligibleCount != null ? <span className="chip chip-success">{upload.diagnosticEligibleCount} eligible</span> : null}
                    {upload.excludedQuestionCount != null && upload.excludedQuestionCount > 0 ? <span className="chip chip-accent">{upload.excludedQuestionCount} excluded</span> : null}
                  </div>
                  {upload.errorMessage ? (
                    <p className="mt-2 text-sm font-medium text-[var(--accent-text)]">
                      {upload.errorMessage}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-shrink-0 flex-wrap gap-2">
                  {upload.pdfUrl ? (
                    <a
                      href={upload.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost text-xs no-underline"
                    >
                      Open PDF
                    </a>
                  ) : null}
                  {upload.rawQuestionsUrl ? (
                    <a
                      href={upload.rawQuestionsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost text-xs no-underline"
                    >
                      Raw JSON
                    </a>
                  ) : null}
                  {upload.questionCount != null && upload.questionCount > 0 ? (
                    <Link
                      to="/admin"
                      search={{
                        tab: 'questions',
                        pdfUploadId: upload._id,
                        sequence: 1,
                      }}
                      className="btn-ghost text-xs no-underline"
                    >
                      Browse
                    </Link>
                  ) : null}
                  {upload.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => retryMutation.mutate(upload._id)}
                      disabled={retryMutation.isPending}
                      className="btn-secondary text-xs"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ─── Questions Tab ─── */

function QuestionsTab({ search }: { search: AdminSearch }) {
  const { data: uploads } = useSuspenseQuery(pdfUploadsQuery(50))
  const selectedSequence = search.sequence ?? 1
  const completedUploads = uploads.filter((u) => u.questionCount != null && u.questionCount > 0)
  const defaultUploadId = search.pdfUploadId ?? completedUploads[0]?._id

  return (
    <div className="fade-in">
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Sidebar: PDF list */}
        <aside className="space-y-2">
          <p className="kicker mb-2 px-1">Question sets</p>
          {completedUploads.length === 0 ? (
            <div className="card-inset p-4">
              <p className="text-sm text-[var(--text-tertiary)]">No processed sets yet.</p>
            </div>
          ) : (
            completedUploads.map((upload) => (
              <Link
                key={upload._id}
                to="/admin"
                search={{
                  tab: 'questions',
                  pdfUploadId: upload._id,
                  sequence: 1,
                }}
                className={[
                  'block rounded-[var(--radius-md)] border px-4 py-3 no-underline transition',
                  upload._id === defaultUploadId
                    ? 'border-[var(--border-accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]',
                ].join(' ')}
              >
                <p className="text-sm font-medium text-[var(--text-primary)]">{upload.fileName}</p>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{upload.questionCount} questions</p>
              </Link>
            ))
          )}
        </aside>

        {/* Main: question viewer */}
        <section>
          {defaultUploadId ? (
            <QuestionViewer pdfUploadId={defaultUploadId} sequence={selectedSequence} />
          ) : (
            <div className="card p-6">
              <p className="text-sm text-[var(--text-tertiary)]">Select a processed PDF to start browsing.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function QuestionViewer({ pdfUploadId, sequence }: { pdfUploadId: string; sequence: number }) {
  const browserQuery = useQuery(questionBrowserQuery(pdfUploadId, sequence))
  const browser = browserQuery.data

  if (browserQuery.isPending) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">Loading question...</p>
      </div>
    )
  }

  if (!browser || browser.question == null) {
    return (
      <div className="card p-6">
        <p className="text-sm text-[var(--text-tertiary)]">Question not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Question header */}
      <div className="card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-semibold text-[var(--text-primary)]">
              {browser.upload.fileName}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Question {browser.currentSequence} of {browser.totalQuestions}
              {' \u00b7 '}
              Original #{browser.question.questionNumber}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/admin"
              search={{
                tab: 'questions',
                pdfUploadId: browser.upload._id,
                sequence: Math.max(1, browser.currentSequence - 1),
              }}
              className="btn-secondary text-xs no-underline"
            >
              Previous
            </Link>
            <Link
              to="/admin"
              search={{
                tab: 'questions',
                pdfUploadId: browser.upload._id,
                sequence: Math.min(browser.totalQuestions, browser.currentSequence + 1),
              }}
              className="btn-primary text-xs no-underline"
            >
              Next
            </Link>
          </div>
        </div>

        {/* Status chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip">
            eligibility: {browser.question.eligibility ?? 'legacy'}
          </span>
          <span className="chip">
            answer: {browser.question.answerStatus ?? 'legacy'}
          </span>
          <span className="chip">
            taxonomy: {browser.question.taxonomyStatus ?? 'legacy'}
          </span>
          {browser.question.subjectId ? (
            <span className="chip chip-accent">{browser.question.subjectId}</span>
          ) : null}
          {browser.question.primarySubtopicId ? (
            <span className="chip chip-accent">{browser.question.primarySubtopicId}</span>
          ) : null}
          {browser.question.answerCorrectOption ? (
            <span className="chip chip-success">correct: {browser.question.answerCorrectOption}</span>
          ) : null}
        </div>
      </div>

      {/* Question body */}
      <div className="card p-6">
        <p className="kicker mb-3">Question body</p>
        <MarkdownBlock markdown={browser.question.bodyMarkdown} />
      </div>

      {/* Options */}
      <div className="space-y-2">
        {browser.question.options.map((option) => (
          <div
            key={option.label}
            className={`option-card cursor-default ${option.label === browser.question!.answerCorrectOption ? 'is-correct' : ''}`}
          >
            <span className="option-label">{option.label}</span>
            <span className="flex-1">
              {option.bodyMarkdown ? (
                <MarkdownBlock markdown={option.bodyMarkdown} />
              ) : (
                <span className="text-sm text-[var(--text-tertiary)]">Empty option body.</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
