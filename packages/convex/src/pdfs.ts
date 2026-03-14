import { mutation, query, internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { slugify } from '../../ingest/src/slug'
import { questionDocumentValidator } from './validators'

async function serializeUpload(
  ctx: { storage: { getUrl: (storageId: Doc<'pdfUploads'>['pdfStorageId']) => Promise<string | null> } },
  upload: Doc<'pdfUploads'>,
) {
  const pdfUrl = await ctx.storage.getUrl(upload.pdfStorageId)
  const ocrPagesUrl = upload.ocrPagesStorageId
    ? await ctx.storage.getUrl(upload.ocrPagesStorageId)
    : null
  const rawQuestionsUrl = upload.rawQuestionsStorageId
    ? await ctx.storage.getUrl(upload.rawQuestionsStorageId)
    : null

  return {
    ...upload,
    pdfUrl,
    ocrPagesUrl,
    rawQuestionsUrl,
  }
}

export const generatePdfUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl()
  },
})

export const createPdfUpload = mutation({
  args: {
    storageId: v.id('_storage'),
    fileName: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const pdfUploadId = await ctx.db.insert('pdfUploads', {
      fileName: args.fileName,
      slug: `${slugify(args.fileName)}-${now}`,
      pdfStorageId: args.storageId,
      contentType: args.contentType,
      sizeBytes: args.sizeBytes,
      status: 'uploaded',
      createdAt: now,
      updatedAt: now,
    })

    await ctx.scheduler.runAfter(0, internal.pdfPipeline.processUploadedPdf, {
      pdfUploadId,
    })

    return pdfUploadId
  },
})

export const retryPdfUpload = mutation({
  args: {
    pdfUploadId: v.id('pdfUploads'),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.pdfUploadId)
    if (upload == null) {
      throw new Error('PDF upload not found.')
    }

    if (upload.status === 'processing') {
      throw new Error('PDF is already processing.')
    }

    await ctx.db.patch(args.pdfUploadId, {
      status: 'uploaded',
      errorMessage: undefined,
      updatedAt: Date.now(),
    })

    await ctx.scheduler.runAfter(0, internal.pdfPipeline.processUploadedPdf, {
      pdfUploadId: args.pdfUploadId,
    })
  },
})

export const listPdfUploads = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const uploads = await ctx.db
      .query('pdfUploads')
      .withIndex('by_createdAt')
      .order('desc')
      .take(args.limit ?? 20)

    return Promise.all(uploads.map((upload) => serializeUpload(ctx, upload)))
  },
})

export const getPdfUploadDetail = query({
  args: {
    pdfUploadId: v.id('pdfUploads'),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.pdfUploadId)
    if (upload == null) {
      return null
    }

    const questions = await ctx.db
      .query('questions')
      .withIndex('by_pdfUploadId_sequence', (q) =>
        q.eq('pdfUploadId', args.pdfUploadId),
      )
      .take(5)

    return {
      upload: await serializeUpload(ctx, upload),
      previewQuestions: questions,
    }
  },
})

export const getQuestionBrowser = query({
  args: {
    pdfUploadId: v.id('pdfUploads'),
    sequence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.pdfUploadId)
    if (upload == null) {
      return null
    }

    const totalQuestions = upload.questionCount ?? 0
    if (totalQuestions === 0) {
      return {
        upload: await serializeUpload(ctx, upload),
        totalQuestions: 0,
        currentSequence: 1,
        question: null,
      }
    }

    const requestedSequence = Math.max(
      1,
      Math.min(args.sequence ?? 1, totalQuestions),
    )

    const currentQuestion = await ctx.db
      .query('questions')
      .withIndex('by_pdfUploadId_sequence', (q) =>
        q.eq('pdfUploadId', args.pdfUploadId).eq('sequence', requestedSequence),
      )
      .unique()
    if (currentQuestion == null) {
      return {
        upload: await serializeUpload(ctx, upload),
        totalQuestions,
        currentSequence: requestedSequence,
        question: null,
      }
    }

    return {
      upload: await serializeUpload(ctx, upload),
      totalQuestions,
      currentSequence: requestedSequence,
      question: currentQuestion,
    }
  },
})

export const getPdfUploadForProcessing = internalQuery({
  args: {
    pdfUploadId: v.id('pdfUploads'),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.pdfUploadId)
  },
})

export const markPdfProcessing = internalMutation({
  args: {
    pdfUploadId: v.id('pdfUploads'),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    await ctx.db.patch(args.pdfUploadId, {
      status: 'processing',
      errorMessage: undefined,
      processingStartedAt: now,
      updatedAt: now,
    })
  },
})

export const clearPdfQuestions = internalMutation({
  args: {
    pdfUploadId: v.id('pdfUploads'),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('questions')
      .withIndex('by_pdfUploadId', (q) => q.eq('pdfUploadId', args.pdfUploadId))
      .collect()

    for (const question of existing) {
      await ctx.db.delete(question._id)
    }
  },
})

export const insertPdfQuestionsChunk = internalMutation({
  args: {
    questions: v.array(questionDocumentValidator),
  },
  handler: async (ctx, args) => {
    for (const question of args.questions) {
      await ctx.db.insert('questions', question)
    }
  },
})

export const markPdfCompleted = internalMutation({
  args: {
    pdfUploadId: v.id('pdfUploads'),
    pageCount: v.number(),
    assetCount: v.number(),
    questionCount: v.number(),
    ocrPagesStorageId: v.id('_storage'),
    rawQuestionsStorageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    await ctx.db.patch(args.pdfUploadId, {
      status: 'completed',
      pageCount: args.pageCount,
      assetCount: args.assetCount,
      questionCount: args.questionCount,
      ocrPagesStorageId: args.ocrPagesStorageId,
      rawQuestionsStorageId: args.rawQuestionsStorageId,
      processedAt: now,
      updatedAt: now,
    })
  },
})

export const markPdfFailed = internalMutation({
  args: {
    pdfUploadId: v.id('pdfUploads'),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pdfUploadId, {
      status: 'failed',
      errorMessage: args.message,
      updatedAt: Date.now(),
    })
  },
})
