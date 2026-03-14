"use node"

import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { v } from 'convex/values'
import { extractQuestionsFromMarkdown, joinPagesMarkdown } from '../../ingest/src/question-extraction-core'
import {
  inferQuestionAnswer,
  tagQuestionTaxonomy,
  type EnrichmentQuestionInput,
  type TaxonomyContract,
} from '../../ingest/src/question-enrichment-core'
import { ocrPdfBlob } from '../../ingest/src/ocr-core'
import type { QuestionExtraction } from '../../ingest/src/question-schema'
import taxonomyContractJson from '../../../docs/taxonomy.v1.json'

const QUESTION_INSERT_CHUNK_SIZE = 20
const ENRICHMENT_CHUNK_SIZE = 10
const DIAGNOSTIC_ANSWER_CONFIDENCE_THRESHOLD = 0.75
const DIAGNOSTIC_TAXONOMY_CONFIDENCE_THRESHOLD = 0.7
const PRACTICE_ANSWER_CONFIDENCE_THRESHOLD = 0.55
const PRACTICE_TAXONOMY_CONFIDENCE_THRESHOLD = 0.55
const taxonomyContract = taxonomyContractJson as TaxonomyContract

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

function toEnrichmentQuestion(question: {
  bodyMarkdown: string
  options: Array<{
    label: string
    bodyMarkdown: string
  }>
}): EnrichmentQuestionInput {
  return {
    bodyMarkdown: question.bodyMarkdown,
    options: question.options,
  }
}

function evaluateEligibility(args: {
  answerStatus: 'completed' | 'failed' | 'needs_review'
  answerConfidence?: number
  taxonomyStatus: 'completed' | 'failed' | 'needs_review'
  taxonomyConfidence?: number
}) {
  const reasons: string[] = []

  if (args.answerStatus !== 'completed') {
    reasons.push('answer_inference_failed')
  }

  if (args.taxonomyStatus !== 'completed') {
    reasons.push('taxonomy_tagging_failed')
  }

  if (
    args.answerConfidence == null
    || args.answerConfidence < PRACTICE_ANSWER_CONFIDENCE_THRESHOLD
  ) {
    reasons.push('low_answer_confidence')
  }

  if (
    args.taxonomyConfidence == null
    || args.taxonomyConfidence < PRACTICE_TAXONOMY_CONFIDENCE_THRESHOLD
  ) {
    reasons.push('low_taxonomy_confidence')
  }

  if (reasons.length > 0) {
    return {
      eligibility: 'excluded' as const,
      reasons,
    }
  }

  if (
    args.answerConfidence != null
    && args.taxonomyConfidence != null
    && args.answerConfidence >= DIAGNOSTIC_ANSWER_CONFIDENCE_THRESHOLD
    && args.taxonomyConfidence >= DIAGNOSTIC_TAXONOMY_CONFIDENCE_THRESHOLD
  ) {
    return {
      eligibility: 'diagnostic' as const,
      reasons: ['diagnostic_ready'],
    }
  }

  return {
    eligibility: 'practice_only' as const,
    reasons: ['practice_only_confidence'],
  }
}

export const processUploadedPdf = internalAction({
  args: {
    pdfUploadId: v.id('pdfUploads'),
  },
  handler: async (ctx, args) => {
    try {
      const upload = await ctx.runQuery(internal.pdfs.getPdfUploadForProcessing, {
        pdfUploadId: args.pdfUploadId,
      })

      if (upload == null) {
        throw new Error('PDF upload not found.')
      }

      await ctx.runMutation(internal.pdfs.markPdfProcessing, {
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
          answerStatus: 'pending' as const,
          taxonomyStatus: 'pending' as const,
          eligibility: 'pending' as const,
        }),
      )

      await ctx.runMutation(internal.pdfs.clearPdfQuestions, {
        pdfUploadId: args.pdfUploadId,
      })

      for (const questions of chunk(
        normalizedQuestions,
        QUESTION_INSERT_CHUNK_SIZE,
      )) {
        await ctx.runMutation(internal.pdfs.insertPdfQuestionsChunk, {
          questions,
        })
      }

      await ctx.runMutation(internal.pdfs.markPdfCompleted, {
        pdfUploadId: args.pdfUploadId,
        pageCount: ocrResult.pageCount,
        assetCount: storedAssets.size,
        questionCount: normalizedQuestions.length,
        ocrPagesStorageId,
        rawQuestionsStorageId,
      })

      const questionIds = await ctx.runQuery(internal.pdfs.getPdfQuestionIds, {
        pdfUploadId: args.pdfUploadId,
      })

      for (const questionIdChunk of chunk(questionIds, ENRICHMENT_CHUNK_SIZE)) {
        await ctx.scheduler.runAfter(0, internal.pdfPipeline.enrichQuestionsChunk, {
          pdfUploadId: args.pdfUploadId,
          questionIds: questionIdChunk,
        })
      }
    } catch (error) {
      await ctx.runMutation(internal.pdfs.markPdfFailed, {
        pdfUploadId: args.pdfUploadId,
        message: formatError(error),
      })
      throw error
    }
  },
})

export const enrichQuestionsChunk = internalAction({
  args: {
    pdfUploadId: v.id('pdfUploads'),
    questionIds: v.array(v.id('questions')),
  },
  handler: async (ctx, args) => {
    const apiKey = requireEnv('GEMINI_API_KEY')
    const questions = await ctx.runQuery(internal.pdfs.getQuestionsForEnrichment, {
      questionIds: args.questionIds,
    })

    for (const question of questions) {
      const enrichmentQuestion = toEnrichmentQuestion(question)

      let answerStatus: 'completed' | 'failed' | 'needs_review' = 'failed'
      let answerConfidence: number | undefined

      await ctx.runMutation(internal.pdfs.setQuestionAnswerProcessing, {
        questionId: question._id,
      })

      try {
        const answer = await inferQuestionAnswer({
          apiKey,
          question: enrichmentQuestion,
        })
        answerStatus = answer.confidence < PRACTICE_ANSWER_CONFIDENCE_THRESHOLD
          ? 'needs_review'
          : 'completed'
        answerConfidence = answer.confidence

        await ctx.runMutation(internal.pdfs.setQuestionAnswerResult, {
          questionId: question._id,
          status: answerStatus,
          correctOption: answer.correctOption,
          solutionMarkdown: answer.solutionMarkdown,
          confidence: answer.confidence,
          modelId: answer.modelId,
          promptVersion: answer.promptVersion,
        })
      } catch (error) {
        await ctx.runMutation(internal.pdfs.setQuestionAnswerResult, {
          questionId: question._id,
          status: 'failed',
          errorMessage: formatError(error),
        })
      }

      let taxonomyStatus: 'completed' | 'failed' | 'needs_review' = 'failed'
      let taxonomyConfidence: number | undefined

      await ctx.runMutation(internal.pdfs.setQuestionTaxonomyProcessing, {
        questionId: question._id,
      })

      try {
        const taxonomy = await tagQuestionTaxonomy({
          apiKey,
          question: enrichmentQuestion,
          taxonomy: taxonomyContract,
        })
        taxonomyStatus = taxonomy.confidence < PRACTICE_TAXONOMY_CONFIDENCE_THRESHOLD
          ? 'needs_review'
          : 'completed'
        taxonomyConfidence = taxonomy.confidence

        await ctx.runMutation(internal.pdfs.setQuestionTaxonomyResult, {
          questionId: question._id,
          status: taxonomyStatus,
          taxonomyVersion: taxonomy.taxonomyVersion,
          taxonomyRelease: taxonomy.taxonomyRelease,
          subjectId: taxonomy.subjectId,
          categoryId: taxonomy.categoryId,
          primarySubtopicId: taxonomy.primarySubtopicId,
          secondarySubtopicIds: taxonomy.secondarySubtopicIds,
          secondaryDimensions: taxonomy.secondaryDimensions,
          confidence: taxonomy.confidence,
          modelId: taxonomy.modelId,
          promptVersion: taxonomy.promptVersion,
        })
      } catch (error) {
        await ctx.runMutation(internal.pdfs.setQuestionTaxonomyResult, {
          questionId: question._id,
          status: 'failed',
          errorMessage: formatError(error),
        })
      }

      const eligibility = evaluateEligibility({
        answerStatus,
        answerConfidence,
        taxonomyStatus,
        taxonomyConfidence,
      })

      await ctx.runMutation(internal.pdfs.setQuestionEligibility, {
        questionId: question._id,
        eligibility: eligibility.eligibility,
        reasons: eligibility.reasons,
      })
    }

    await ctx.runMutation(internal.pdfs.refreshPdfEnrichmentStats, {
      pdfUploadId: args.pdfUploadId,
    })
  },
})
