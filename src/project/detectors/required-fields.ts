// src/project/detectors/required-fields.ts
import type { z } from 'zod'

/** Returns the field names of a ZodObject that are required AND have no .default(). */
export function getRequiredFieldsWithoutDefaults<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): readonly string[] {
  const shape = schema.shape
  const required: string[] = []
  for (const key of Object.keys(shape)) {
    const field = shape[key] as z.ZodTypeAny
    if (field.isOptional()) continue
    required.push(key)
  }
  return required
}
