export interface GuideFrontmatter {
  title: string
  topic: string        // url-safe slug; must equal the directory name
  description: string
  category: string
  order: number
  escape_scripts?: string[]  // declared escape-hatch script filenames (security allowlist)
}

export interface GuideEntry {
  topic: string
  dir: string          // absolute path to content/guides/<topic>
  mdPath: string       // <dir>/index.md
  htmlPath: string     // <dir>/index.html
  frontmatter: GuideFrontmatter
}

export interface TocHeading {
  depth: number        // 2 or 3
  text: string
  id: string           // slug used as the heading's id and TOC anchor
}
