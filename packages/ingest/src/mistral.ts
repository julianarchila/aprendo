export interface OcrExtraction {
  provider: 'mistral'
  markdown: string
  images: Array<{ id: string; description: string }>
}

export async function extractPdfWithMistral(
  inputPath: string,
): Promise<OcrExtraction> {
  return {
    provider: 'mistral',
    markdown: `# Placeholder OCR output\n\nSource file: ${inputPath}`,
    images: [
      {
        id: 'placeholder-image-001',
        description: 'Placeholder extracted asset for future OCR output.',
      },
    ],
  }
}
