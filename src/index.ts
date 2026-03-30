#!/usr/bin/env node
import { runCli } from './cli/index.js'

runCli(process.argv.slice(2)).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`scaffold: ${msg}\n`)
  process.exit(1)
})
