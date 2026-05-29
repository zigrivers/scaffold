import { describe, it, expect } from 'vitest'
import { detectConfigChanges } from '../../src/core/diff-introspect.js'

const DIFF_WITH_ACK = `diff --git a/.mmr/acks/${'a'.repeat(40)}.json b/.mmr/acks/${'a'.repeat(40)}.json
new file mode 100644
--- /dev/null
+++ b/.mmr/acks/${'a'.repeat(40)}.json
@@ -0,0 +1,5 @@
+{ "finding_key": "${'a'.repeat(40)}", "normalized_location": "src/foo.ts" }
`

const DIFF_WITH_CONFIG = `diff --git a/.mmr.yaml b/.mmr.yaml
index 1234..5678 100644
--- a/.mmr.yaml
+++ b/.mmr.yaml
@@ -1,3 +1,5 @@
 version: 1
 channels:
+  evil:
+    kind: http
`

const DIFF_BENIGN = `diff --git a/src/foo.ts b/src/foo.ts
index 1..2 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
-old
+new
`

describe('detectConfigChanges', () => {
  it('reports ack-file additions', () => {
    const r = detectConfigChanges(DIFF_WITH_ACK)
    expect(r.ack_files_changed).toEqual([`.mmr/acks/${'a'.repeat(40)}.json`])
    expect(r.config_file_changed).toBe(false)
  })

  it('reports .mmr.yaml changes', () => {
    const r = detectConfigChanges(DIFF_WITH_CONFIG)
    expect(r.config_file_changed).toBe(true)
    expect(r.ack_files_changed).toEqual([])
  })

  it('reports no changes for a benign diff', () => {
    const r = detectConfigChanges(DIFF_BENIGN)
    expect(r.config_file_changed).toBe(false)
    expect(r.ack_files_changed).toEqual([])
  })

  it('reports both when a single diff touches both', () => {
    const r = detectConfigChanges(DIFF_WITH_ACK + '\n' + DIFF_WITH_CONFIG)
    expect(r.config_file_changed).toBe(true)
    expect(r.ack_files_changed).toHaveLength(1)
  })

  it('detects config changes across diff-format variants (evasion resistance)', () => {
    // git --no-prefix (no a//b/)
    expect(detectConfigChanges('diff --git .mmr.yaml .mmr.yaml\n--- .mmr.yaml\n+++ .mmr.yaml\n').config_file_changed).toBe(true)
    // raw diff -u (no `diff --git` header, only ---/+++)
    expect(detectConfigChanges('--- a/.mmr.yaml\n+++ b/.mmr.yaml\n@@ -1 +1 @@\n-x\n+y\n').config_file_changed).toBe(true)
    // merge diff (diff --cc)
    expect(detectConfigChanges('diff --cc .mmr.yaml\n').config_file_changed).toBe(true)
    // casing variant on a case-insensitive filesystem
    expect(detectConfigChanges('diff --git a/.MMR.YAML b/.MMR.YAML\n').config_file_changed).toBe(true)
  })

  it('detects ack changes across format variants and renames', () => {
    const key = 'a'.repeat(40)
    // --no-prefix ack
    expect(detectConfigChanges(`diff --git .mmr/acks/${key}.json .mmr/acks/${key}.json\n`).ack_files_changed)
      .toEqual([`.mmr/acks/${key}.json`])
    // raw diff -u ack (no diff --git line)
    expect(detectConfigChanges(`--- a/.mmr/acks/${key}.json\n+++ b/.mmr/acks/${key}.json\n`).ack_files_changed)
      .toEqual([`.mmr/acks/${key}.json`])
    // rename metadata
    expect(detectConfigChanges(`rename from .mmr/acks/${key}.json\nrename to other.txt\n`).ack_files_changed)
      .toEqual([`.mmr/acks/${key}.json`])
  })

  it('does not flag a benign file whose hunk content merely mentions a sentinel path', () => {
    const r = detectConfigChanges(
      'diff --git a/docs/readme.md b/docs/readme.md\n--- a/docs/readme.md\n+++ b/docs/readme.md\n@@ -1 +1 @@\n+see .mmr.yaml for config\n',
    )
    expect(r.config_file_changed).toBe(false)
  })
})
