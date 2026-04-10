import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAdoption } from '../project/adopt.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../tests/fixtures/adopt/detectors')

describe('scaffold adopt end-to-end per project type', () => {
  it.each([
    ['game', 'game/unity-only'],
    ['web-app', 'web-app/nextjs-standalone'],
    ['backend', 'backend/express-postgres'],
    ['cli', 'cli/node-bin'],
    ['library', 'library/esm-types'],
    ['mobile-app', 'mobile-app/expo-cross'],
    ['data-pipeline', 'data-pipeline/dbt'],
    ['ml', 'ml/pytorch-train'],
    ['browser-extension', 'browser-extension/mv3-popup'],
  ])('detects %s from %s fixture', async (expectedType, fixture) => {
    const fixturePath = path.join(FIXTURES, fixture)
    const result = await runAdoption({
      projectRoot: fixturePath,
      metaPromptDir: path.join(fixturePath, '.scaffold'),
      methodology: 'deep',
      dryRun: true,
      auto: true,
      force: true,
      verbose: false,
    })
    expect(result.projectType).toBe(expectedType)
    expect(result.detectedConfig?.type).toBe(expectedType)
    expect(result.errors).toHaveLength(0)
  })
})
