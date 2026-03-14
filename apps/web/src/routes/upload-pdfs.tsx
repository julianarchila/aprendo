import { useConvexMutation } from '@convex-dev/react-query'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '@aprendo/convex/api'
import { pdfUploadsQuery } from '../lib/pdf-queries'
import { uploadPdfToConvex } from '../lib/pdf-upload'

export const Route = createFileRoute('/upload-pdfs')({
  component: UploadPdfsPage,
  pendingComponent: UploadPdfsPending,
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(pdfUploadsQuery())
  },
})

function UploadPdfsPage() {
  const queryClient = useQueryClient()
  const { data: uploads } = useSuspenseQuery(pdfUploadsQuery())
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const generateUploadUrl = useConvexMutation(api.pdfs.generatePdfUploadUrl)
  const createPdfUpload = useConvexMutation(api.pdfs.createPdfUpload)
  const retryPdfUpload = useConvexMutation(api.pdfs.retryPdfUpload)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return uploadPdfToConvex({
        file,
        generateUploadUrl,
        createPdfUpload,
      })
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    },
    onSuccess: async () => {
      setErrorMessage(null)
      setSelectedFile(null)
      await queryClient.invalidateQueries({
        queryKey: pdfUploadsQuery().queryKey,
      })
    },
  })

  const retryMutation = useMutation({
    mutationFn: async (pdfUploadId: string) => {
      await retryPdfUpload({
        pdfUploadId: pdfUploadId as never,
      })
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    },
  })

  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-[2rem] p-6 sm:p-8">
        <p className="island-kicker mb-2">PDF admin</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Upload PDFs and run the ingest pipeline
        </h1>
        <p className="max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          Each upload is stored in Convex file storage, processed through OCR,
          converted into extracted assets, run through question extraction, and
          then persisted as independent question documents.
        </p>

        <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white/50 p-5">
          <label className="mb-3 block text-sm font-semibold text-[var(--sea-ink)]">
            Select a PDF
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] ?? null)
              }}
              className="block w-full text-sm text-[var(--sea-ink-soft)] file:mr-4 file:rounded-full file:border-0 file:bg-[rgba(79,184,178,0.14)] file:px-4 file:py-2 file:font-semibold file:text-[var(--lagoon-deep)]"
            />
            <button
              type="button"
              disabled={selectedFile == null || uploadMutation.isPending}
              onClick={() => {
                if (selectedFile == null) return
                uploadMutation.mutate(selectedFile)
              }}
              className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload PDF'}
            </button>
          </div>

          {selectedFile ? (
            <p className="mt-3 mb-0 text-sm text-[var(--sea-ink-soft)]">
              Ready:
              {' '}
              <strong>{selectedFile.name}</strong>
              {' '}
              ({Math.ceil(selectedFile.size / 1024)} KB)
            </p>
          ) : null}

          {errorMessage ? (
            <p className="mt-3 mb-0 text-sm font-semibold text-[color:#9a3d3d]">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-8 space-y-4">
        {uploads.length === 0 ? (
          <section className="island-shell rounded-2xl p-6">
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              No PDFs uploaded yet.
            </p>
          </section>
        ) : (
          uploads.map((upload) => (
            <article
              key={upload._id}
              className="island-shell rounded-2xl p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="island-kicker mb-2">PDF upload</p>
                  <h2 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
                    {upload.fileName}
                  </h2>
                  <p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
                    Status:
                    {' '}
                    <strong>{upload.status}</strong>
                    {' · '}
                    {Math.ceil(upload.sizeBytes / 1024)} KB
                    {upload.questionCount != null ? ` · ${upload.questionCount} questions` : ''}
                    {upload.assetCount != null ? ` · ${upload.assetCount} assets` : ''}
                  </p>
                  {upload.errorMessage ? (
                    <p className="mt-2 mb-0 text-sm font-semibold text-[color:#9a3d3d]">
                      {upload.errorMessage}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {upload.pdfUrl ? (
                    <a
                      href={upload.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
                    >
                      Open PDF
                    </a>
                  ) : null}
                  {upload.rawQuestionsUrl ? (
                    <a
                      href={upload.rawQuestionsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
                    >
                      Raw questions JSON
                    </a>
                  ) : null}
                  {upload.questionCount != null && upload.questionCount > 0 ? (
                    <Link
                      to="/questions"
                      search={{
                        pdfUploadId: upload._id,
                        sequence: 1,
                      }}
                      className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
                    >
                      Browse questions
                    </Link>
                  ) : null}
                  {upload.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => {
                        retryMutation.mutate(upload._id)
                      }}
                      disabled={retryMutation.isPending}
                      className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}

function UploadPdfsPending() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-[2rem] p-6 sm:p-8">
        <p className="island-kicker mb-2">PDF admin</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Loading uploads...
        </h1>
      </section>
    </main>
  )
}
