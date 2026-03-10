import { z } from 'zod'

const OptionSchema = z.object({
  label: z.string().describe('The option letter: A, B, C, or D'),
  text: z
    .string()
    .optional()
    .describe(
      'Text content of the option. Omit when the option is image-only.',
    ),
  images: z
    .array(z.string())
    .optional()
    .describe(
      'Image paths (from the markdown) when the option is or contains an image.',
    ),
})

export const QuestionExtractionSchema = z.object({
  questionNumber: z.number().describe('The question number as it appears in the document.'),
  context: z
    .string()
    .optional()
    .describe(
      'Shared context/preamble that introduces a group of questions (e.g. "RESPONDA LAS PREGUNTAS X A Y DE ACUERDO CON LA SIGUIENTE INFORMACIÓN" and the text/tables that follow). Include the full block. Omit if the question has no shared context.',
    ),
  contextImages: z
    .array(z.string())
    .optional()
    .describe(
      'Image paths referenced inside the shared context block. Omit if none.',
    ),
  stem: z
    .string()
    .describe('The question text itself, without the options.'),
  stemImages: z
    .array(z.string())
    .optional()
    .describe(
      'Image paths referenced inside the question stem. Omit if none.',
    ),
  options: z
    .array(OptionSchema)
    .describe('The answer options (typically A through D).'),
})

export type QuestionExtraction = z.infer<typeof QuestionExtractionSchema>
