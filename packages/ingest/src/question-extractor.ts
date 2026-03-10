import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as FileSystem from '@effect/platform/FileSystem'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText, Output } from 'ai'
import { Cause, Config, Console, Data, Effect, Option } from 'effect'
import { QuestionExtractionSchema } from './question-schema'
import type { QuestionExtraction } from './question-schema'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export interface ExtractorPaths {
  pagesDir: string
  artifactRoot: string
}

export function getDefaultExtractorPaths(): ExtractorPaths {
  const srcDir = path.dirname(fileURLToPath(import.meta.url))
  const packageRoot = path.resolve(srcDir, '..')
  const artifactRoot = path.join(
    packageRoot,
    '.artifacts',
    'mistral-ocr',
    'matematicas2010',
  )

  return {
    artifactRoot,
    pagesDir: path.join(artifactRoot, 'pages'),
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class QuestionExtractorError extends Data.TaggedError(
  'QuestionExtractorError',
)<{
  code:
    | 'EXTRACTION_FAILED'
    | 'OUTPUT_WRITE_FAILED'
    | 'PAGES_NOT_FOUND'
  message: string
  details?: Record<string, unknown>
}> {}

function fail(
  code: QuestionExtractorError['code'],
  message: string,
  details?: Record<string, unknown>,
) {
  return new QuestionExtractorError({ code, message, details })
}

function fileSystemCause(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a structured data extractor for standardized exam PDFs that have been
OCR'd into markdown. Your task is to extract every multiple-choice question
from the document below.

## Rules

1. Each question has a number, a stem (the question text), and options (A, B,
   C, D).

2. Some questions share a context block — a preamble introduced by text like
   "RESPONDA LAS PREGUNTAS X A Y DE ACUERDO CON LA SIGUIENTE INFORMACIÓN".
   When you encounter this, include the full context text (and any images in it)
   in EVERY question that it applies to.

3. Images appear in the markdown as ![alt](path). Do NOT describe or interpret
   images. Instead, place the path string (e.g. "../assets/page-05-image-01.jpg")
   into the appropriate field:
   - contextImages: images that are part of a shared context block
   - stemImages: images that are part of a specific question's stem
   - options[].images: images that ARE the answer option (or part of it)

4. When an answer option is only an image with no text, set text to null and
   put the image path in images.

5. Preserve all LaTeX notation exactly as it appears (both $inline$ and
   $$block$$ forms).

6. Preserve markdown table content exactly as it appears when it is part of a
   question context or stem.

7. Ignore any content that is not part of a question — cover pages, headers,
   footers, answer keys, instructions about how to answer, etc.

8. Number questions exactly as they appear in the document.`

function buildPrompt(pagesMarkdown: string): string {
  return `${SYSTEM_PROMPT}

## Document

<document>
${pagesMarkdown}
</document>`
}

// ---------------------------------------------------------------------------
// Read page markdown files
// ---------------------------------------------------------------------------

function readPageMarkdownFiles(pagesDir: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    const entries = yield* fs.readDirectory(pagesDir).pipe(
      Effect.mapError((error) =>
        fail('PAGES_NOT_FOUND', 'Could not read pages directory.', {
          pagesDir,
          cause: fileSystemCause(error),
        }),
      ),
    )

    const markdownFiles = entries
      .filter((f) => f.endsWith('.md'))
      .sort()

    if (markdownFiles.length === 0) {
      return yield* Effect.fail(
        fail('PAGES_NOT_FOUND', 'No markdown page files found.', { pagesDir }),
      )
    }

    const pages: string[] = []
    for (const file of markdownFiles) {
      const content = yield* fs
        .readFileString(path.join(pagesDir, file))
        .pipe(
          Effect.mapError((error) =>
            fail('PAGES_NOT_FOUND', `Failed to read page file: ${file}`, {
              file,
              cause: fileSystemCause(error),
            }),
          ),
        )
      pages.push(content)
    }

    return pages.join('\n\n---\n\n')
  })
}

// ---------------------------------------------------------------------------
// Call Gemini
// ---------------------------------------------------------------------------

function extractQuestions(args: { apiKey: string; pagesMarkdown: string }) {
  return Effect.tryPromise({
    try: async () => {
      const google = createGoogleGenerativeAI({ apiKey: args.apiKey })

      const { output } = await generateText({
        model: google('gemini-2.5-flash'),
        output: Output.array({
          element: QuestionExtractionSchema,
        }),
        providerOptions: {
          google: {
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
        prompt: buildPrompt(args.pagesMarkdown),
      })

      if (output == null) {
        throw new Error('Gemini returned null output.')
      }

      return output
    },
    catch: (error) =>
      fail('EXTRACTION_FAILED', 'Gemini extraction request failed.', {
        cause: error instanceof Error ? error.message : String(error),
      }),
  })
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

function writeQuestions(args: {
  questions: QuestionExtraction[]
  outputPath: string
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const json = JSON.stringify(args.questions, null, 2)

    yield* fs.writeFileString(args.outputPath, `${json}\n`).pipe(
      Effect.mapError((error) =>
        fail('OUTPUT_WRITE_FAILED', 'Failed to write questions JSON.', {
          outputPath: args.outputPath,
          cause: fileSystemCause(error),
        }),
      ),
    )
  })
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export function runQuestionExtractor(
  paths: ExtractorPaths = getDefaultExtractorPaths(),
) {
  return Effect.gen(function* () {
    const apiKey = yield* Config.string('GEMINI_API_KEY')

    yield* Console.log('Reading page markdown files...')
    const pagesMarkdown = yield* readPageMarkdownFiles(paths.pagesDir)

    yield* Console.log('Extracting questions with Gemini...')
    const questions = yield* extractQuestions({ apiKey, pagesMarkdown })

    const outputPath = path.join(paths.artifactRoot, 'questions.json')
    yield* Console.log(`Writing ${questions.length} questions to ${outputPath}`)
    yield* writeQuestions({ questions, outputPath })

    return { questionCount: questions.length }
  })
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function runCli() {
  await Effect.runPromise(
    runQuestionExtractor().pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => {
          const failure = Cause.failureOption(cause)

          return Effect.sync(() => {
            if (
              Option.isSome(failure) &&
              failure.value instanceof QuestionExtractorError
            ) {
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
              { status: 'ok', questionCount: result.questionCount },
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
