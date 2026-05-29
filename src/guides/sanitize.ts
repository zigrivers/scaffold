import { defaultSchema } from 'rehype-sanitize'
import type { Schema } from 'hast-util-sanitize'

// Cloned default schema; directive tasks extend this object's allowances.
export const guideSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'button'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'id', 'className', 'role', 'dataTab'],
  },
}
