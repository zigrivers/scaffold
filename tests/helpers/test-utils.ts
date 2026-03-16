import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures')

/**
 * Creates a temporary directory for use in tests.
 * Callers are responsible for cleaning up via fs.rmSync(dir, { recursive: true }).
 */
export async function createTempDir(): Promise<string> {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'scaffold-test-'))
}

/**
 * Loads a fixture file from tests/fixtures/ by name and returns its content as a string.
 */
export function loadFixture(name: string): string {
  const fixturePath = path.join(FIXTURES_DIR, name)
  return fs.readFileSync(fixturePath, 'utf-8')
}
