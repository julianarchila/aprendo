import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as FileSystem from '@effect/platform/FileSystem'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { Mistral } from '@mistralai/mistralai'
import { Cause, Config, Console, Data, Effect, Option } from 'effect'

const samplePdfRelativePath = 'data/pdfs/Matemáticas2010.pdf'

export class SampleOcrError extends Data.TaggedError('SampleOcrError')<{
  code:
    | 'ARTIFACT_SETUP_FAILED'
    | 'ASSET_WRITE_FAILED'
    | 'MARKDOWN_WRITE_FAILED'
    | 'MISSING_MISTRAL_API_KEY'
    | 'OCR_REQUEST_FAILED'
    | 'PDF_NOT_FOUND'
    | 'PDF_READ_FAILED'
  message: string
  details?: Record<string, unknown>
}> {}

export interface SampleOcrPaths {
  packageRoot: string
  repoRoot: string
  pdfPath: string
  artifactRoot: string
  assetsDir: string
  pagesDir: string
}

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
    assetsDir: path.join(artifactRoot, 'assets'),
    pagesDir: path.join(artifactRoot, 'pages'),
  }
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

function loadRequiredEnvVar(key: string) {
  return Config.string(key).pipe(
    Effect.mapError((error) =>
      failSampleOcr(
        'MISSING_MISTRAL_API_KEY',
        'MISTRAL_API_KEY is missing from configuration.',
        { key, cause: String(error) },
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
          { pdfPath, cause: fileSystemCause(error) },
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
          { artifactRoot: paths.artifactRoot, cause: fileSystemCause(error) },
        ),
      ),
    )

    for (const dir of [paths.assetsDir, paths.pagesDir]) {
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.mapError((error) =>
          failSampleOcr(
            'ARTIFACT_SETUP_FAILED',
            'Failed to prepare OCR artifact directories.',
            { dir, cause: fileSystemCause(error) },
          ),
        ),
      )
    }
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

/**
 * Saves extracted images for a page to the assets directory. Returns a map
 * from the Mistral asset id (e.g. "img-0.jpeg") to the relative path from
 * the pages directory to the saved file, so image links in the markdown can
 * be rewritten.
 */
function savePageImages(args: {
  pageNumber: number
  images: { id: string; imageBase64?: string | null }[]
  assetsDir: string
  pagesDir: string
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const idToRelativePath = new Map<string, string>()

    for (const [index, image] of args.images.entries()) {
      if (image.imageBase64 === null || image.imageBase64 === undefined) {
        continue
      }

      const imageBuffer = decodeBase64Payload(image.imageBase64)
      const extension = detectImageExtension(imageBuffer)
      const fileName = buildImageAssetFileName(args.pageNumber, index, extension)
      const absolutePath = path.join(args.assetsDir, fileName)

      yield* fs.writeFile(absolutePath, imageBuffer).pipe(
        Effect.mapError((error) =>
          failSampleOcr('ASSET_WRITE_FAILED', 'Failed to save image asset.', {
            fileName,
            cause: fileSystemCause(error),
          }),
        ),
      )

      const relativePath = path
        .relative(args.pagesDir, absolutePath)
        .split(path.sep)
        .join('/')

      idToRelativePath.set(image.id, relativePath)
    }

    return idToRelativePath
  })
}

/**
 * Rewrites Mistral placeholder image links in the page markdown to point at
 * the locally saved asset files.
 */
function rewriteImageLinks(
  markdown: string,
  idToRelativePath: Map<string, string>,
) {
  let result = markdown
  for (const [id, relativePath] of idToRelativePath) {
    result = result.replaceAll(`(${id})`, `(${relativePath})`)
  }
  return result
}

/**
 * Builds the full markdown content for a page: the OCR text (with rewritten
 * image links) followed by any separately-extracted tables.
 */
export function buildPageMarkdown(args: {
  pageNumber: number
  markdown: string
  tables: { id: string; content: string }[]
  idToRelativePath: Map<string, string>
}) {
  const rewritten = rewriteImageLinks(args.markdown.trim(), args.idToRelativePath)

  const lines = [`# Page ${args.pageNumber}`, '', rewritten]

  if (args.tables.length > 0) {
    lines.push('', '## Tables', '')
    for (const table of args.tables) {
      lines.push(`<!-- ${table.id} -->`, '', table.content.trim(), '')
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}

export function runSampleOcr(paths: SampleOcrPaths = getSampleOcrPaths()) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const apiKey = yield* loadRequiredEnvVar('MISTRAL_API_KEY')
    const documentUrl = yield* loadPdfDocumentUrl(paths.pdfPath)

    yield* resetArtifactDirectories(paths)

    const response = yield* requestOcr({ apiKey, documentUrl })

    for (const page of response.pages) {
      const pageNumber = page.index + 1

      const idToRelativePath = yield* savePageImages({
        pageNumber,
        images: page.images,
        assetsDir: paths.assetsDir,
        pagesDir: paths.pagesDir,
      })

      const markdown = buildPageMarkdown({
        pageNumber,
        markdown: page.markdown,
        tables: (page.tables ?? []).map((t) => ({ id: t.id, content: t.content })),
        idToRelativePath,
      })

      const markdownPath = path.join(
        paths.pagesDir,
        buildPageMarkdownFileName(pageNumber),
      )

      yield* fs.writeFileString(markdownPath, markdown).pipe(
        Effect.mapError((error) =>
          failSampleOcr(
            'MARKDOWN_WRITE_FAILED',
            'Failed to write page markdown.',
            { markdownPath, cause: fileSystemCause(error) },
          ),
        ),
      )
    }

    return { pageCount: response.pages.length }
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
            JSON.stringify({ status: 'ok', pageCount: result.pageCount }, null, 2),
          ),
      }),
      Effect.provide(NodeFileSystem.layer),
    ),
  )
}

if (import.meta.main) {
  void runCli()
}
