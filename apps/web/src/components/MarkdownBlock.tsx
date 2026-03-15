import { Streamdown } from 'streamdown'
import { createMathPlugin } from '@streamdown/math'
import 'katex/dist/katex.min.css'

const math = createMathPlugin({
  singleDollarTextMath: true,
})

export default function MarkdownBlock({ markdown, controls = false }: { markdown: string; controls?: boolean }) {
  return (
    <Streamdown
      className="markdown-body"
      plugins={{ math }}
      controls={controls}
    >
      {markdown}
    </Streamdown>
  )
}
