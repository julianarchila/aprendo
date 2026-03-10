import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Mistral } from '@mistralai/mistralai'
import { Console, Effect } from 'effect'
import type { OCRResponse } from '@mistralai/mistralai/models/components'

const samplePdfRelativePath = 'data/pdfs/Matemáticas2010.pdf'

export type SampleOcrPageAssetKind = 'image' | 'table'

export interface SampleOcrPageAsset {
  kind: SampleOcrPageAssetKind
  pageNumber: number
  label: string
  filePath: string | null
  markdownContent: string | null
  sourceAssetId: string
}

export interface SampleOcrPage {
  pageNumber: number
  markdown: string
  assets: SampleOcrPageAsset[]
}

export interface SampleOcrPageArtifact {
  pageNumber: number
  markdownPath: string
  imageCount: number
  tableCount: number
}

export interface SampleOcrRunSummary {
  sourcePdf: string
  generatedAt: string
  rawResponsePath: string
  pages: SampleOcrPageArtifact[]
}

class SampleOcrPageError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'SampleOcrPageError'
  }
}

function getScriptPaths() {
  const srcDir = path.dirname(fileURLToPath(import.meta.url))
  const packageRoot = path.resolve(srcDir, '..')
  const repoRoot = path.resolve(packageRoot, '../..')
  const artifactRoot = path.join(
    packageRoot,
    '.artifacts',
    'mistral-ocr',
    'matematicas2010',
  )

  return {
    packageRoot,
    repoRoot,
    pdfPath: path.join(repoRoot, samplePdfRelativePath),
    artifactRoot,
    rawDir: path.join(artifactRoot, 'raw'),
    assetsDir: path.join(artifactRoot, 'assets'),
    pagesDir: path.join(artifactRoot, 'pages'),
    summaryPath: path.join(artifactRoot, 'pages.json'),
  }
}

function toRepoRelativePath(repoRoot: string, absolutePath: string) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/')
}

function decodeBase64Payload(base64Payload: string) {
  const dataUrlMatch = base64Payload.match(/^data:.*;base64,(.+)$/)
  return Buffer.from(dataUrlMatch?.[1] ?? base64Payload, 'base64')
}

function detectImageExtension(imageBuffer: Buffer) {
  if (
    imageBuffer.length >= 8 &&
    imageBuffer[0] === 0x89 &&
    imageBuffer[1] === 0x50 &&
    imageBuffer[2] === 0x4e &&
    imageBuffer[3] === 0x47
  ) {
    return 'png'
  }

  if (imageBuffer.length >= 2 && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) {
    return 'jpg'
  }

  if (
    imageBuffer.length >= 3 &&
    imageBuffer[0] === 0x47 &&
    imageBuffer[1] === 0x49 &&
    imageBuffer[2] === 0x46
  ) {
    return 'gif'
  }

  if (
    imageBuffer.length >= 12 &&
    imageBuffer.toString('ascii', 0, 4) === 'RIFF' &&
    imageBuffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }

  return 'bin'
}

export function buildRawResponseFileName() {
  return 'ocr-response.json'
}

export function buildImageAssetFileName(
  pageNumber: number,
  imageIndex: number,
  extension: string,
) {
  return `page-${String(pageNumber).padStart(2, '0')}-image-${String(imageIndex + 1).padStart(2, '0')}.${extension}`
}

export function buildPageMarkdownFileName(pageNumber: number) {
  return `page-${String(pageNumber).padStart(2, '0')}.md`
}

function renderAssetMarkdown(
  asset: SampleOcrPageAsset,
  resolveMarkdownAssetPath: (asset: SampleOcrPageAsset) => string | null,
) {
  if (asset.kind === 'table') {
    return [
      `### ${asset.label}`,
      '',
      `Source asset id: ${asset.sourceAssetId}`,
      '',
      asset.markdownContent ?? '_No table markdown returned._',
      '',
    ]
  }

  const markdownAssetPath = resolveMarkdownAssetPath(asset)

  return [
    `### ${asset.label}`,
    '',
    `Source asset id: ${asset.sourceAssetId}`,
    '',
    markdownAssetPath
      ? `![${asset.label}](${markdownAssetPath})`
      : '> Image bytes were not returned for this asset.',
    '',
  ]
}

function rewriteInlineImageLinks(
  markdown: string,
  assets: SampleOcrPageAsset[],
  resolveMarkdownAssetPath: (asset: SampleOcrPageAsset) => string | null,
) {
  let rewrittenMarkdown = markdown

  for (const asset of assets) {
    if (asset.kind !== 'image') {
      continue
    }

    const markdownAssetPath = resolveMarkdownAssetPath(asset)

    if (!markdownAssetPath) {
      continue
    }

    rewrittenMarkdown = rewrittenMarkdown.replaceAll(
      `(${asset.sourceAssetId})`,
      `(${markdownAssetPath})`,
    )
  }

  return rewrittenMarkdown
}

export function renderPageMarkdown(
  page: SampleOcrPage,
  resolveMarkdownAssetPath: (asset: SampleOcrPageAsset) => string | null,
) {
  const rewrittenMarkdown = rewriteInlineImageLinks(
    page.markdown.trim(),
    page.assets,
    resolveMarkdownAssetPath,
  )
  const lines = [
    '---',
    `pageNumber: ${page.pageNumber}`,
    `imageCount: ${page.assets.filter((asset) => asset.kind === 'image').length}`,
    `tableCount: ${page.assets.filter((asset) => asset.kind === 'table').length}`,
    '---',
    '',
    `# Page ${page.pageNumber}`,
    '',
    '## OCR Text',
    '',
    rewrittenMarkdown,
  ]

  const tables = page.assets.filter((asset) => asset.kind === 'table')
  const images = page.assets.filter((asset) => asset.kind === 'image')

  if (tables.length > 0) {
    lines.push('', '## Tables', '')
    for (const table of tables) {
      lines.push(...renderAssetMarkdown(table, resolveMarkdownAssetPath))
    }
  }

  if (images.length > 0) {
    lines.push('', '## Images', '')
    for (const image of images) {
      lines.push(...renderAssetMarkdown(image, resolveMarkdownAssetPath))
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}

async function writeJsonArtifact(filePath: string, payload: unknown) {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function writePageMarkdownArtifacts(args: {
  pages: SampleOcrPage[]
  pagesDir: string
  repoRoot: string
}) {
  await mkdir(args.pagesDir, { recursive: true })

  for (const page of args.pages) {
    const markdownPath = path.join(
      args.pagesDir,
      buildPageMarkdownFileName(page.pageNumber),
    )
    const markdown = renderPageMarkdown(page, (asset) => {
      if (!asset.filePath) {
        return null
      }

      const absoluteAssetPath = path.join(args.repoRoot, asset.filePath)
      return path
        .relative(args.pagesDir, absoluteAssetPath)
        .split(path.sep)
        .join('/')
    })

    await writeFile(markdownPath, markdown, 'utf8')
  }
}

function ensureFileExists(filePath: string) {
  return Effect.tryPromise({
    try: async () => {
      const fileStats = await stat(filePath)

      if (!fileStats.isFile()) {
        throw new SampleOcrPageError(
          'Expected a file path but found something else.',
          'INVALID_FILE_PATH',
          { filePath },
        )
      }
    },
    catch: (error) =>
      error instanceof SampleOcrPageError
        ? error
        : new SampleOcrPageError('Sample PDF was not found.', 'PDF_NOT_FOUND', {
            filePath,
            cause: error instanceof Error ? error.message : String(error),
          }),
  })
}

function loadRequiredEnvVar(key: string) {
  return Effect.sync(() => {
    const value = process.env[key]?.trim() ?? ''

    if (value.length > 0) {
      return value
    }

    throw new SampleOcrPageError(
      'MISTRAL_API_KEY is missing from the Bun environment.',
      'MISSING_MISTRAL_API_KEY',
      { key },
    )
  })
}

function buildPdfDataUrl(pdfPath: string) {
  return Effect.tryPromise({
    try: async () => {
      const fileBuffer = await readFile(pdfPath)
      return `data:application/pdf;base64,${fileBuffer.toString('base64')}`
    },
    catch: (error) =>
      new SampleOcrPageError('Unable to read the sample PDF.', 'PDF_READ_FAILED', {
        pdfPath,
        cause: error instanceof Error ? error.message : String(error),
      }),
  })
}

function persistPageAssets(args: {
  response: OCRResponse
  assetsDir: string
  repoRoot: string
}) {
  return Effect.tryPromise({
    try: async () => {
      const pageMap = new Map<number, SampleOcrPage>()

      for (const page of args.response.pages) {
        const pageNumber = page.index + 1
        const assets: SampleOcrPageAsset[] = []

        for (const [imageIndex, image] of page.images.entries()) {
          let filePath: string | null = null

          if (image.imageBase64) {
            const imageBuffer = decodeBase64Payload(image.imageBase64)
            const extension = detectImageExtension(imageBuffer)
            const absolutePath = path.join(
              args.assetsDir,
              buildImageAssetFileName(pageNumber, imageIndex, extension),
            )

            await writeFile(absolutePath, imageBuffer)
            filePath = toRepoRelativePath(args.repoRoot, absolutePath)
          }

          assets.push({
            kind: 'image',
            pageNumber,
            label: `Image ${imageIndex + 1}`,
            filePath,
            markdownContent: null,
            sourceAssetId: image.id,
          })
        }

        for (const [tableIndex, table] of (page.tables ?? []).entries()) {
          assets.push({
            kind: 'table',
            pageNumber,
            label: `Table ${tableIndex + 1}`,
            filePath: null,
            markdownContent: table.content.trim(),
            sourceAssetId: table.id,
          })
        }

        pageMap.set(pageNumber, {
          pageNumber,
          markdown: page.markdown.trim(),
          assets,
        })
      }

      return Array.from(pageMap.values()).sort(
        (left, right) => left.pageNumber - right.pageNumber,
      )
    },
    catch: (error) =>
      new SampleOcrPageError('Failed to persist OCR page assets.', 'ASSET_WRITE_FAILED', {
        cause: error instanceof Error ? error.message : String(error),
      }),
  })
}

const program = Effect.gen(function* () {
  const paths = getScriptPaths()

  yield* ensureFileExists(paths.pdfPath)
  const apiKey = yield* loadRequiredEnvVar('MISTRAL_API_KEY')
  const pdfDataUrl = yield* buildPdfDataUrl(paths.pdfPath)

  yield* Effect.tryPromise(() => rm(paths.artifactRoot, { recursive: true, force: true }))
  yield* Effect.tryPromise(() => mkdir(paths.rawDir, { recursive: true }))
  yield* Effect.tryPromise(() => mkdir(paths.assetsDir, { recursive: true }))

  const client = new Mistral({ apiKey })
  const response = yield* Effect.tryPromise({
    try: () =>
      client.ocr.process({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          documentUrl: pdfDataUrl,
        },
        includeImageBase64: true,
        tableFormat: 'markdown',
        extractHeader: false,
        extractFooter: false,
      }),
    catch: (error) =>
      new SampleOcrPageError('Mistral OCR request failed.', 'OCR_REQUEST_FAILED', {
        cause: error instanceof Error ? error.message : String(error),
      }),
  })

  const rawResponsePath = path.join(paths.rawDir, buildRawResponseFileName())
  yield* Effect.tryPromise(() => writeJsonArtifact(rawResponsePath, response))

  const pages = yield* persistPageAssets({
    response,
    assetsDir: paths.assetsDir,
    repoRoot: paths.repoRoot,
  })

  yield* Effect.tryPromise(() =>
    writePageMarkdownArtifacts({
      pages,
      pagesDir: paths.pagesDir,
      repoRoot: paths.repoRoot,
    }),
  )

  const pageArtifacts: SampleOcrPageArtifact[] = pages.map((page) => ({
    pageNumber: page.pageNumber,
    markdownPath: toRepoRelativePath(
      paths.repoRoot,
      path.join(paths.pagesDir, buildPageMarkdownFileName(page.pageNumber)),
    ),
    imageCount: page.assets.filter((asset) => asset.kind === 'image').length,
    tableCount: page.assets.filter((asset) => asset.kind === 'table').length,
  }))

  const summary: SampleOcrRunSummary = {
    sourcePdf: samplePdfRelativePath,
    generatedAt: new Date().toISOString(),
    rawResponsePath: toRepoRelativePath(paths.repoRoot, rawResponsePath),
    pages: pageArtifacts,
  }

  yield* Effect.tryPromise(() => writeJsonArtifact(paths.summaryPath, summary))
  yield* Console.log(
    JSON.stringify(
      {
        status: 'ok',
        rawResponsePath: summary.rawResponsePath,
        markdownDir: toRepoRelativePath(paths.repoRoot, paths.pagesDir),
        pageCount: pages.length,
      },
      null,
      2,
    ),
  )
})

Effect.runPromise(
  program.pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        if (error instanceof SampleOcrPageError) {
          console.error(
            JSON.stringify(
              {
                status: 'error',
                code: error.code,
                message: error.message,
                details: error.details ?? null,
              },
              null,
              2,
            ),
          )
          process.exitCode = 1
          return
        }

        console.error(error)
        process.exitCode = 1
      }),
    ),
  ),
)
