import { defaultSchema } from 'rehype-sanitize'
import type { Schema } from 'hast-util-sanitize'

// Cloned default schema; directive tasks extend this object's allowances.
export const guideSanitizeSchema: Schema = {
  ...defaultSchema,
  // Disable id-rewriting (defaultSchema sets clobberPrefix:'user-content-', which
  // rewrites heading ids to 'user-content-<slug>' and breaks scrollspy/TOC anchor
  // links). Safe here because guide content is in-repo and passes code review —
  // DOM-clobber protection on our own generated heading ids is unnecessary.
  clobberPrefix: '',
  tagNames: [...(defaultSchema.tagNames ?? []), 'button', 'input'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'id', 'className', 'role', 'dataTab', 'ariaLabel', 'style'],
    input: ['type', 'placeholder', 'className', 'ariaLabel'],
  },
}
