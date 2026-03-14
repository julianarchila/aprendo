import { v } from 'convex/values'

export const pdfUploadStatusValidator = v.union(
  v.literal('uploaded'),
  v.literal('processing'),
  v.literal('completed'),
  v.literal('failed'),
)

export const storedAssetValidator = v.object({
  storageId: v.id('_storage'),
  fileName: v.string(),
  contentType: v.string(),
  sourcePath: v.string(),
  pageNumber: v.number(),
  imageIndex: v.number(),
})

export const questionOptionValidator = v.object({
  label: v.string(),
  bodyMarkdown: v.string(),
})

export const questionDocumentValidator = v.object({
  pdfUploadId: v.id('pdfUploads'),
  questionNumber: v.number(),
  sequence: v.number(),
  bodyMarkdown: v.string(),
  options: v.array(questionOptionValidator),
  createdAt: v.number(),
})
