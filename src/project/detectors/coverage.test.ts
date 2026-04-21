// src/project/detectors/coverage.test.ts
import { describe, it, expect } from 'vitest'
import { ProjectTypeSchema } from '../../config/schema.js'
import { ALL_DETECTORS } from './index.js'
import { createFakeSignalContext } from './context.js'
import type { DetectionMatch } from './types.js'

describe('detector registry completeness', () => {
  it('ALL_DETECTORS claims one match per ProjectType', () => {
    const ctx = createFakeSignalContext({
      packageJson: {
        name: 'maximal-fixture',
        main: 'dist/index.js',
        bin: { cli: 'dist/cli.js' },
        dependencies: {
          react: '^18.0.0',
          express: '^4.0.0',
          next: '^14.0.0',
          'react-native': '^0.72.0',
          commander: '^11.0.0',
        },
        scripts: { build: 'tsc' },
      },
      pyprojectToml: {
        project: {
          name: 'm',
          dependencies: ['torch', 'pandas', 'fastapi', 'marimo', 'dvc', 'typer'],
        },
      },
      cargoToml: {
        package: { name: 'game', version: '0.1.0' },
        dependencies: { bevy: '^0.12.0' },
      },
      files: {
        'pyproject.toml': '...',
        'dvc.yaml': 'stages: {}',
        'dbt_project.yml': 'name: my-dbt\n',
        'manifest.json': '{"manifest_version":3,"content_scripts":[{"matches":["*://*/*"]}],"action":{"default_popup":"popup.html"}}',
        'pubspec.yaml': 'name: m\n',
        'next.config.mjs': 'export default { output: "standalone" }',
        'experiment.py': '# experiment',
      },
      dirs: ['src/routes', 'experiments', 'ios', 'android'],
      rootEntries: [
        'package.json', 'pyproject.toml', 'Cargo.toml', 'dvc.yaml',
        'manifest.json', 'analysis.ipynb', 'next.config.mjs', 'pubspec.yaml',
        'experiment.py', 'dbt_project.yml',
      ],
    })

    const claimedTypes = new Set<string>()
    for (const detect of ALL_DETECTORS) {
      const m: DetectionMatch | null = detect(ctx)
      if (m) claimedTypes.add(m.projectType)
    }

    const schemaTypes = new Set(ProjectTypeSchema.options as readonly string[])
    if (!claimedTypes.has('library')) {
      schemaTypes.delete('library')
    }
    expect(claimedTypes).toEqual(schemaTypes)
  })
})
