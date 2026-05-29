import type { TocHeading } from './types.js'
import { CHROME_JS, THEME_INIT_JS } from './chrome.js'

export const CHROME_VERSION = 1

export interface WrapArgs {
  title: string
  body: string
  headings: TocHeading[]
  css: string
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function toc(headings: TocHeading[]): string {
  const items = headings
    .map((h) => `<li class="toc-${h.depth}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`)
    .join('')
  return `<nav class="toc" aria-label="Table of contents"><ul>${items}</ul></nav>`
}

export function wrapInChrome({ title, body, headings, css }: WrapArgs): string {
  return `<!DOCTYPE html>
<html lang="en" data-chrome-version="${CHROME_VERSION}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- scaffold:chrome v${CHROME_VERSION} -->
<style>${css}</style>
<script>${THEME_INIT_JS}</script>
</head>
<body>
<header class="topbar">
  <button data-action="nav" class="nav-toggle" aria-label="Toggle navigation">☰</button>
  <h1>${esc(title)}</h1>
  <button data-action="theme" class="theme-toggle" aria-label="Toggle theme">◐</button>
</header>
<div class="layout">
  <aside class="rail">${toc(headings)}</aside>
  <main class="content">${body}</main>
</div>
<script>${CHROME_JS}</script>
</body>
</html>
`
}
