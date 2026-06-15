import type { ResolvedTheme } from './use-resolved-theme.ts'

/**
 * Design tokens injected into the lesson-demo iframe so the generated demo looks
 * like part of Aprendo instead of a generic web page. These mirror the subset of
 * `styles.css` that demos are told to use (see `DEMO_FRAGMENT_RULES` in
 * `packages/convex/src/lessons.ts`) — keep the two in sync.
 */
const TOKENS: Record<ResolvedTheme, Record<string, string>> = {
  light: {
    '--bg': '#faf5f0',
    '--bg-card': '#ffffff',
    '--bg-inset': '#f7f2ec',
    '--text-primary': '#1a1a1a',
    '--text-secondary': '#6b6560',
    '--text-tertiary': '#9e9590',
    '--text-inverted': '#ffffff',
    '--accent': '#e07460',
    '--accent-soft': 'rgba(224, 116, 96, 0.12)',
    '--accent-hover': '#cc6354',
    '--success': '#4caf7d',
    '--border': 'rgba(0, 0, 0, 0.07)',
  },
  dark: {
    '--bg': '#141210',
    '--bg-card': '#1e1b18',
    '--bg-inset': '#171512',
    '--text-primary': '#ede8e2',
    '--text-secondary': '#a09890',
    '--text-tertiary': '#706860',
    '--text-inverted': '#1a1a1a',
    '--accent': '#e8877a',
    '--accent-soft': 'rgba(232, 135, 122, 0.14)',
    '--accent-hover': '#f0998e',
    '--success': '#6ec89a',
    '--border': 'rgba(255, 255, 255, 0.08)',
  },
}

const RADII = {
  '--radius-sm': '10px',
  '--radius-md': '14px',
}

const FONTS = {
  '--font-sans': '"Manrope", ui-sans-serif, system-ui, sans-serif',
  '--font-display': '"Fraunces", Georgia, serif',
}

function rootBlock(theme: ResolvedTheme): string {
  const vars = { ...TOKENS[theme], ...RADII, ...FONTS }
  return Object.entries(vars)
    .map(([name, value]) => `    ${name}: ${value};`)
    .join('\n')
}

/**
 * Wrap an AI-generated demo *fragment* in a full, sandboxed HTML document that
 * carries the app's fonts, color tokens and current theme. The generated
 * fragment references those CSS variables, so the demo inherits Aprendo's look
 * and matches light/dark mode.
 */
export function buildDemoDocument(fragment: string, theme: ResolvedTheme): string {
  return `<!DOCTYPE html>
<html lang="es" data-theme="${theme}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
${rootBlock(theme)}
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    padding: 1.25rem;
    font-family: var(--font-sans);
    font-size: 15px;
    line-height: 1.5;
    color: var(--text-primary);
    background: var(--bg-card);
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3, h4 { font-family: var(--font-display); font-weight: 600; margin: 0 0 0.5rem; }
  p { color: var(--text-secondary); }
  button {
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    color: var(--text-inverted);
    background: var(--accent);
    border: none;
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.9rem;
    transition: background 0.15s ease;
  }
  button:hover { background: var(--accent-hover); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  input[type="range"] { accent-color: var(--accent); width: 100%; }
  label { color: var(--text-secondary); font-size: 13px; font-weight: 600; }
</style>
</head>
<body>
${fragment}
</body>
</html>`
}
