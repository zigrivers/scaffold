import { CliConfigSchema, BackendConfigSchema, LibraryConfigSchema } from './src/config/schema.js'
import { z } from 'zod'
type CliConfig = z.infer<typeof CliConfigSchema>
type BackendConfig = z.infer<typeof BackendConfigSchema>
type LibraryConfig = z.infer<typeof LibraryConfigSchema>
const c: CliConfig = { interactivity: 'interactive' }
const b: BackendConfig = { apiStyle: 'rest' }
const l: LibraryConfig = { visibility: 'public' }
