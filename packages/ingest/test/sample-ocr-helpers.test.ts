import { describe, expect, test } from 'bun:test'
import {
  buildImageAssetFileName,
  buildPageMarkdownFileName,
  buildRawResponseFileName,
  renderPageMarkdown,
} from '../src/mistral-ocr-sample'
import type { SampleOcrPage } from '../src/mistral-ocr-sample'

describe('buildRawResponseFileName', () => {
  test('uses a stable raw OCR response file name', () => {
    expect(buildRawResponseFileName()).toBe('ocr-response.json')
  })
})

describe('buildImageAssetFileName', () => {
  test('uses stable page-based file names for extracted images', () => {
    expect(buildImageAssetFileName(8, 0, 'png')).toBe('page-08-image-01.png')
    expect(buildImageAssetFileName(14, 2, 'jpg')).toBe('page-14-image-03.jpg')
  })
})

describe('buildPageMarkdownFileName', () => {
  test('uses stable file names for per-page markdown notes', () => {
    expect(buildPageMarkdownFileName(1)).toBe('page-01.md')
    expect(buildPageMarkdownFileName(14)).toBe('page-14.md')
  })
})

describe('renderPageMarkdown', () => {
  test('renders a standalone markdown note with page text, tables, and images', () => {
    const markdown = renderPageMarkdown(
      {
        pageNumber: 2,
        markdown:
          '# OCR page content\n\nPregunta de ejemplo.\n\n![img-1](img-1)',
        assets: [
          {
            kind: 'image',
            pageNumber: 2,
            label: 'Image 1',
            filePath: 'packages/ingest/.artifacts/mistral-ocr/matematicas2010/assets/page-02-image-01.jpg',
            markdownContent: null,
            sourceAssetId: 'img-1',
          },
          {
            kind: 'table',
            pageNumber: 2,
            label: 'Table 1',
            filePath: null,
            markdownContent: '| x | y |\n| - | - |\n| 1 | 2 |',
            sourceAssetId: 'table-1',
          },
        ],
      } satisfies SampleOcrPage,
      (asset) =>
        asset.filePath === null ? null : '../assets/page-02-image-01.jpg',
    )

    expect(markdown).toContain('# Page 2')
    expect(markdown).toContain('## OCR Text')
    expect(markdown).toContain('## Tables')
    expect(markdown).toContain('## Images')
    expect(markdown).toContain('![img-1](../assets/page-02-image-01.jpg)')
    expect(markdown).toContain('![Image 1](../assets/page-02-image-01.jpg)')
    expect(markdown).toContain('| x | y |')
    expect(markdown).toContain('Source asset id: table-1')
  })
})
