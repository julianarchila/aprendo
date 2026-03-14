import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText, Output } from 'ai'
import { QuestionExtractionSchema } from './question-schema'
import type { QuestionExtraction } from './question-schema'

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

export function joinPagesMarkdown(pages: string[]) {
  return pages.join('\n\n---\n\n')
}

export async function extractQuestionsFromMarkdown(args: {
  apiKey: string
  pagesMarkdown: string
}): Promise<QuestionExtraction[]> {
  const google = createGoogleGenerativeAI({ apiKey: args.apiKey })
  const { output } = await generateText({
    model: google('gemini-3-flash-preview'),
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
}
