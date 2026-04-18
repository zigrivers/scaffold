import type { DecisionEntry } from '../types/index.js'
import type { StatePathResolver } from './state-path-resolver.js'
import { fileExists, ensureDir, atomicWriteFile } from '../utils/fs.js'
import { decisionParseError } from '../utils/errors.js'
import fs from 'node:fs'
import path from 'node:path'

const DECISIONS_FILE = 'decisions.jsonl'
const SCAFFOLD_DIR = '.scaffold'

function decisionsPath(projectRoot: string, pathResolver?: StatePathResolver): string {
  return pathResolver?.decisionsPath ?? path.join(projectRoot, SCAFFOLD_DIR, DECISIONS_FILE)
}

/**
 * Read all valid DecisionEntry objects from decisions.jsonl.
 * Skips blank lines and emits a warning for corrupt lines (tolerant reader).
 */
function readAllEntries(filePath: string): DecisionEntry[] {
  if (!fileExists(filePath)) return []

  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split('\n')
  const entries: DecisionEntry[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue

    try {
      entries.push(JSON.parse(line) as DecisionEntry)
    } catch (err) {
      const warning = decisionParseError(filePath, i + 1, (err as Error).message)
      process.stderr.write(`[scaffold] ${warning.message}\n`)
    }
  }

  return entries
}

/** Extract the numeric value from a D-NNN id string. Returns 0 if not parseable. */
function idToNumber(id: string): number {
  const match = /^D-(\d+)$/.exec(id)
  if (!match) return 0
  return parseInt(match[1], 10)
}

/** Compute the next D-NNN id based on existing entries in the file. */
function getNextId(projectRoot: string, pathResolver?: StatePathResolver): string {
  const filePath = decisionsPath(projectRoot, pathResolver)
  if (!fileExists(filePath)) return 'D-001'

  const entries = readAllEntries(filePath)
  if (entries.length === 0) return 'D-001'

  const max = Math.max(...entries.map(e => idToNumber(e.id)))
  return `D-${(max + 1).toString().padStart(3, '0')}`
}

/**
 * Append a decision entry to .scaffold/decisions.jsonl.
 * Assigns the next sequential ID (D-001, D-002, ...).
 * @returns The assigned decision ID.
 */
export function appendDecision(
  projectRoot: string,
  entry: Omit<DecisionEntry, 'id'>,
  pathResolver?: StatePathResolver,
): string {
  const scaffoldDir = pathResolver?.scaffoldDir ?? path.join(projectRoot, SCAFFOLD_DIR)
  fs.mkdirSync(scaffoldDir, { recursive: true })

  const filePath = decisionsPath(projectRoot, pathResolver)
  const id = getNextId(projectRoot, pathResolver)
  const fullEntry: DecisionEntry = { id, ...entry }
  const newLine = JSON.stringify(fullEntry) + '\n'

  // Atomic append: read existing content, append new line, write atomically
  const existing = fileExists(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  atomicWriteFile(filePath, existing + newLine)

  return id
}

/**
 * Read decision entries from .scaffold/decisions.jsonl.
 * Optionally filter by step slug or limit to last N entries.
 */
export function readDecisions(
  projectRoot: string,
  filter?: { step?: string; last?: number },
  pathResolver?: StatePathResolver,
): DecisionEntry[] {
  const filePath = decisionsPath(projectRoot, pathResolver)
  let entries = readAllEntries(filePath)

  if (filter?.step !== undefined) {
    entries = entries.filter(e => e.prompt === filter.step)
  }

  if (filter?.last !== undefined) {
    entries = entries.slice(-filter.last)
  }

  return entries
}
