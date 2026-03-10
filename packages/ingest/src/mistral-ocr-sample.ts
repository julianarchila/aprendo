import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as FileSystem from '@effect/platform/FileSystem'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { Mistral } from '@mistralai/mistralai'
import type { OCRResponse } from '@mistralai/mistralai/models/components'
import { Cause, Config, Console, Data, Effect, Option } from 'effect'

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

export interface SampleOcrPaths {
  packageRoot: string
  repoRoot: string
  pdfPath: string
  artifactRoot: string
  rawDir: string
  assetsDir: string
  pagesDir: string
  summaryPath: string
}

export interface SampleOcrRunResult {
  summary: SampleOcrRunSummary
  markdownDir: string
  pageCount: number
}

export class SampleOcrError extends Data.TaggedError('SampleOcrError')<{
  code:
    | 'ASSET_WRITE_FAILED'
    | 'ARTIFACT_SETUP_FAILED'
    | 'ARTIFACT_WRITE_FAILED'
    | 'MISSING_MISTRAL_API_KEY'
    | 'OCR_REQUEST_FAILED'
    | 'PDF_NOT_FOUND'
    | 'PDF_READ_FAILED'
  message: string
  details?: Record<string, unknown>
}> {}

export function getSampleOcrPaths(): SampleOcrPaths {
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

  if (
    imageBuffer.length >= 2 &&
    imageBuffer[0] === 0xff &&
    imageBuffer[1] === 0xd8
  ) {
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

function countAssetsByKind(
  assets: SampleOcrPageAsset[],
  kind: SampleOcrPageAssetKind,
) {
  return assets.filter((asset) => asset.kind === kind).length
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

    if (markdownAssetPath === null) {
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
    `imageCount: ${countAssetsByKind(page.assets, 'image')}`,
    `tableCount: ${countAssetsByKind(page.assets, 'table')}`,
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

function failSampleOcr(
  code: SampleOcrError['code'],
  message: string,
  details?: Record<string, unknown>,
) {
  return new SampleOcrError({ code, message, details })
}

function fileSystemCause(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function loadRequiredEnvVar(key: string) {
  return Config.string(key).pipe(
    Effect.mapError((error) =>
      failSampleOcr(
        'MISSING_MISTRAL_API_KEY',
        'MISTRAL_API_KEY is missing from configuration.',
        {
          key,
          cause: String(error),
        },
      ),
    ),
  )
}

function loadPdfDocumentUrl(pdfPath: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const fileBuffer = yield* fs.readFile(pdfPath).pipe(
      Effect.mapError((error) =>
        failSampleOcr(
          error._tag === 'SystemError' && error.reason === 'NotFound'
            ? 'PDF_NOT_FOUND'
            : 'PDF_READ_FAILED',
          'Unable to read the sample PDF.',
          {
            pdfPath,
            cause: fileSystemCause(error),
          },
        ),
      ),
    )

    return `data:application/pdf;base64,${Buffer.from(fileBuffer).toString('base64')}`
  })
}

function resetArtifactDirectories(paths: SampleOcrPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    yield* fs.remove(paths.artifactRoot, { recursive: true }).pipe(
      Effect.catchTag('SystemError', (error) =>
        error.reason === 'NotFound' ? Effect.void : Effect.fail(error),
      ),
      Effect.mapError((error) =>
        failSampleOcr(
          'ARTIFACT_SETUP_FAILED',
          'Failed to prepare OCR artifact directories.',
          {
            artifactRoot: paths.artifactRoot,
            cause: fileSystemCause(error),
          },
        ),
      ),
    )

    yield* fs.makeDirectory(paths.rawDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        failSampleOcr(
          'ARTIFACT_SETUP_FAILED',
          'Failed to prepare OCR artifact directories.',
          {
            artifactRoot: paths.artifactRoot,
            cause: fileSystemCause(error),
          },
        ),
      ),
    )
    yield* fs.makeDirectory(paths.assetsDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        failSampleOcr(
          'ARTIFACT_SETUP_FAILED',
          'Failed to prepare OCR artifact directories.',
          {
            artifactRoot: paths.artifactRoot,
            cause: fileSystemCause(error),
          },
        ),
      ),
    )
    yield* fs.makeDirectory(paths.pagesDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        failSampleOcr(
          'ARTIFACT_SETUP_FAILED',
          'Failed to prepare OCR artifact directories.',
          {
            artifactRoot: paths.artifactRoot,
            cause: fileSystemCause(error),
          },
        ),
      ),
    )
  })
}

function writeJsonArtifact(filePath: string, payload: unknown) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFileString(filePath, `${JSON.stringify(payload, null, 2)}\n`).pipe(
      Effect.mapError((error) =>
        failSampleOcr('ARTIFACT_WRITE_FAILED', 'Failed to write JSON artifact.', {
          filePath,
          cause: fileSystemCause(error),
        }),
      ),
    )
  })
}

function writePageMarkdownArtifacts(args: {
  pages: SampleOcrPage[]
  pagesDir: string
  repoRoot: string
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    for (const page of args.pages) {
      const markdownPath = path.join(
        args.pagesDir,
        buildPageMarkdownFileName(page.pageNumber),
      )
      const markdown = renderPageMarkdown(page, (asset) => {
        if (asset.filePath === null) {
          return null
        }

        const absoluteAssetPath = path.join(args.repoRoot, asset.filePath)
        return path.relative(args.pagesDir, absoluteAssetPath).split(path.sep).join('/')
      })

      yield* fs.writeFileString(markdownPath, markdown).pipe(
        Effect.mapError((error) =>
          failSampleOcr(
            'ARTIFACT_WRITE_FAILED',
            'Failed to write page markdown artifacts.',
            {
              pagesDir: args.pagesDir,
              cause: fileSystemCause(error),
            },
          ),
        ),
      )
    }
  })
}

function persistPageAssets(args: {
  response: OCRResponse
  assetsDir: string
  repoRoot: string
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const pages: SampleOcrPage[] = []

    for (const page of args.response.pages) {
      const pageNumber = page.index + 1
      const assets: SampleOcrPageAsset[] = []

      for (const [imageIndex, image] of page.images.entries()) {
        let filePath: string | null = null

        if (image.imageBase64 !== null && image.imageBase64 !== undefined) {
          const imageBuffer = decodeBase64Payload(image.imageBase64)
          const extension = detectImageExtension(imageBuffer)
          const absolutePath = path.join(
            args.assetsDir,
            buildImageAssetFileName(pageNumber, imageIndex, extension),
          )

          yield* fs.writeFile(absolutePath, imageBuffer).pipe(
            Effect.mapError((error) =>
              failSampleOcr(
                'ASSET_WRITE_FAILED',
                'Failed to persist OCR page assets.',
                {
                  assetsDir: args.assetsDir,
                  cause: fileSystemCause(error),
                },
              ),
            ),
          )
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

      pages.push({
        pageNumber,
        markdown: page.markdown.trim(),
        assets,
      })
    }

    return pages.sort((left, right) => left.pageNumber - right.pageNumber)
  })
}

function requestOcr(args: { apiKey: string; documentUrl: string }) {
  return Effect.tryPromise({
    try: () =>
      new Mistral({ apiKey: args.apiKey }).ocr.process({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          documentUrl: args.documentUrl,
        },
        includeImageBase64: true,
        tableFormat: 'markdown',
      }),
    catch: (error) =>
      failSampleOcr('OCR_REQUEST_FAILED', 'Mistral OCR request failed.', {
        cause: error instanceof Error ? error.message : String(error),
      }),
  })
}

function buildPageArtifacts(
  pages: SampleOcrPage[],
  paths: SampleOcrPaths,
): SampleOcrPageArtifact[] {
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    markdownPath: toRepoRelativePath(
      paths.repoRoot,
      path.join(paths.pagesDir, buildPageMarkdownFileName(page.pageNumber)),
    ),
    imageCount: countAssetsByKind(page.assets, 'image'),
    tableCount: countAssetsByKind(page.assets, 'table'),
  }))
}

function buildRunSummary(args: {
  paths: SampleOcrPaths
  rawResponsePath: string
  pages: SampleOcrPage[]
}): SampleOcrRunSummary {
  return {
    sourcePdf: samplePdfRelativePath,
    generatedAt: new Date().toISOString(),
    rawResponsePath: toRepoRelativePath(args.paths.repoRoot, args.rawResponsePath),
    pages: buildPageArtifacts(args.pages, args.paths),
  }
}

export function runSampleOcr(paths: SampleOcrPaths = getSampleOcrPaths()) {
  return Effect.gen(function* () {
    const apiKey = yield* loadRequiredEnvVar('MISTRAL_API_KEY')
    const documentUrl = yield* loadPdfDocumentUrl(paths.pdfPath)

    yield* resetArtifactDirectories(paths)

    const response = yield* requestOcr({ apiKey, documentUrl })

    const rawResponsePath = path.join(paths.rawDir, buildRawResponseFileName())
    yield* writeJsonArtifact(rawResponsePath, response)

    const pages = yield* persistPageAssets({
      response,
      assetsDir: paths.assetsDir,
      repoRoot: paths.repoRoot,
    })

    yield* writePageMarkdownArtifacts({
      pages,
      pagesDir: paths.pagesDir,
      repoRoot: paths.repoRoot,
    })

    const summary = buildRunSummary({
      paths,
      rawResponsePath,
      pages,
    })

    yield* writeJsonArtifact(paths.summaryPath, summary)

    return {
      summary,
      markdownDir: toRepoRelativePath(paths.repoRoot, paths.pagesDir),
      pageCount: pages.length,
    } satisfies SampleOcrRunResult
  })
}

async function runCli() {
  await Effect.runPromise(
    runSampleOcr().pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => {
          const failure = Cause.failureOption(cause)

          return Effect.sync(() => {
            if (Option.isSome(failure) && failure.value instanceof SampleOcrError) {
              console.error(
                JSON.stringify(
                  {
                    status: 'error',
                    code: failure.value.code,
                    message: failure.value.message,
                    details: failure.value.details ?? null,
                  },
                  null,
                  2,
                ),
              )
            } else {
              console.error(cause)
            }

            process.exitCode = 1
          })
        },
        onSuccess: (result) =>
          Console.log(
            JSON.stringify(
              {
                status: 'ok',
                rawResponsePath: result.summary.rawResponsePath,
                markdownDir: result.markdownDir,
                pageCount: result.pageCount,
              },
              null,
              2,
            ),
          ),
      }),
      Effect.provide(NodeFileSystem.layer),
    ),
  )
}

if (import.meta.main) {
  void runCli()
}
