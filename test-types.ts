import { WebAppConfigSchema } from './src/config/schema.js'
import { z } from 'zod'
type WebAppConfig = z.infer<typeof WebAppConfigSchema>
const x: WebAppConfig = { renderingStrategy: 'ssr' }
const y: WebAppConfig = { renderingStrategy: 'ssr', deployTarget: 123 }
