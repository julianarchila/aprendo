"use node"

import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { v } from 'convex/values'
import { extractQuestionsFromMarkdown, joinPagesMarkdown } from '../../ingest/src/question-extraction-core'
import { ocrPdfBlob } from '../../ingest/src/ocr-core'
import type { QuestionExtraction } from '../../ingest/src/question-schema'

const QUESTION_INSERT_CHUNK_SIZE = 20
const internalApi = internal as any

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function toJsonBlob(data: unknown) {
  return new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
}

function normalizeOptionText(text: string | null | undefined) {
  if (text == null) return null
  if (text.trim().toLowerCase() === 'null') return null
  return text
}

function rewriteAssetUrls(markdown: string, assetUrlBySourcePath: Map<string, string>) {
  let rewritten = markdown
  for (const [sourcePath, url] of assetUrlBySourcePath) {
    rewritten = rewritten.replaceAll(`(${sourcePath})`, `(${url})`)
    rewritten = rewritten.replaceAll(sourcePath, url)
  }
  return rewritten
}

function buildQuestionBodyMarkdown(question: QuestionExtraction) {
  return [question.context, question.stem].filter(Boolean).join('\n\n')
}

function buildOptionBodyMarkdown(option: QuestionExtraction['options'][number]) {
  const parts: string[] = []
  const text = normalizeOptionText(option.text)
  if (text) {
    parts.push(text)
  }

  for (const imagePath of option.images ?? []) {
    parts.push(`![](${imagePath})`)
  }

  return parts.join('\n\n').trim()
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

export const processUploadedPdf = internalAction({
  args: {
    pdfUploadId: v.id('pdfUploads'),
  },
  handler: async (ctx, args) => {
    try {
      const upload = await ctx.runQuery(internalApi.pdfs.getPdfUploadForProcessing, {
        pdfUploadId: args.pdfUploadId,
      })

      if (upload == null) {
        throw new Error('PDF upload not found.')
      }

      await ctx.runMutation(internalApi.pdfs.markPdfProcessing, {
        pdfUploadId: args.pdfUploadId,
      })

      const pdfBlob = await ctx.storage.get(upload.pdfStorageId)
      if (pdfBlob == null) {
        throw new Error('Uploaded PDF blob not found in Convex storage.')
      }

      const ocrResult = await ocrPdfBlob({
        apiKey: requireEnv('MISTRAL_API_KEY'),
        pdfBlob,
      })

      const storedAssets = new Map<
        string,
        {
          storageId: Id<'_storage'>
          fileName: string
          contentType: string
          sourcePath: string
          pageNumber: number
          imageIndex: number
        }
      >()
      const assetUrlBySourcePath = new Map<string, string>()

      for (const page of ocrResult.pages) {
        for (const asset of page.assets) {
          const storageId = await ctx.storage.store(asset.blob)
          const publicUrl = await ctx.storage.getUrl(storageId)
          if (publicUrl == null) {
            throw new Error(`Could not generate public URL for asset ${asset.fileName}.`)
          }
          storedAssets.set(asset.sourcePath, {
            storageId,
            fileName: asset.fileName,
            contentType: asset.contentType,
            sourcePath: asset.sourcePath,
            pageNumber: asset.pageNumber,
            imageIndex: asset.imageIndex,
          })
          assetUrlBySourcePath.set(asset.sourcePath, publicUrl)
        }
      }

      const pagesMarkdown = joinPagesMarkdown(
        ocrResult.pages.map((page) => page.markdown),
      )
      const extractedQuestions = await extractQuestionsFromMarkdown({
        apiKey: requireEnv('GEMINI_API_KEY'),
        pagesMarkdown,
      })

      const ocrPagesStorageId = await ctx.storage.store(
        toJsonBlob(
          ocrResult.pages.map((page) => ({
            pageNumber: page.pageNumber,
            markdown: page.markdown,
          })),
        ),
      )
      const rawQuestionsStorageId = await ctx.storage.store(
        toJsonBlob(extractedQuestions),
      )

      const now = Date.now()
      const normalizedQuestions = extractedQuestions.map(
        (question: QuestionExtraction, index: number) => ({
          pdfUploadId: args.pdfUploadId,
          questionNumber: question.questionNumber,
          sequence: index + 1,
          bodyMarkdown: rewriteAssetUrls(
            buildQuestionBodyMarkdown(question),
            assetUrlBySourcePath,
          ),
          options: question.options.map((option) => ({
            label: option.label,
            bodyMarkdown: rewriteAssetUrls(
              buildOptionBodyMarkdown(option),
              assetUrlBySourcePath,
            ),
          })),
          createdAt: now,
        }),
      )

      await ctx.runMutation(internalApi.pdfs.clearPdfQuestions, {
        pdfUploadId: args.pdfUploadId,
      })

      for (const questions of chunk(
        normalizedQuestions,
        QUESTION_INSERT_CHUNK_SIZE,
      )) {
        await ctx.runMutation(internalApi.pdfs.insertPdfQuestionsChunk, {
          questions,
        })
      }

      await ctx.runMutation(internalApi.pdfs.markPdfCompleted, {
        pdfUploadId: args.pdfUploadId,
        pageCount: ocrResult.pageCount,
        assetCount: storedAssets.size,
        questionCount: normalizedQuestions.length,
        ocrPagesStorageId,
        rawQuestionsStorageId,
      })
    } catch (error) {
      await ctx.runMutation(internalApi.pdfs.markPdfFailed, {
        pdfUploadId: args.pdfUploadId,
        message: formatError(error),
      })
      throw error
    }
  },
})
