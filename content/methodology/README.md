# Methodology Depth Levels

The scaffold pipeline supports 5 depth levels that control the thoroughness of each step's output.

| Depth | Name | Description |
|-------|------|-------------|
| 1 | Minimal | Bare minimum viable output. Just enough to start building. |
| 2 | Light | Slightly more detail than minimal. Still focused on speed over completeness. |
| 3 | Balanced | Recommended for most projects. Good coverage without excessive documentation. |
| 4 | Thorough | Comprehensive output with external model validation (Codex/Gemini) when available. |
| 5 | Exhaustive | Maximum detail with multi-model reconciliation. Best for critical or regulated projects. |

## Presets

| Preset | Default Depth | Philosophy |
|--------|---------------|------------|
| `mvp.yml` | 1 | Ship fast. Only essential steps enabled. No review cycles beyond PRD/stories. |
| `custom-defaults.yml` | 3 | Balanced. Most steps enabled. Innovation and automated review disabled by default. |
| `deep.yml` | 5 | Maximum quality. All steps enabled. External model dispatch at depth 4+. |

## How Depth Affects Steps

Each pipeline step defines a `## Methodology Scaling` section with behavior at each depth:
- **mvp** bullet: What the step produces at depth 1-2
- **deep** bullet: What the step produces at depth 4-5
- **custom:depth(1-5)** bullet: Explicit per-level breakdown

Depth 3 is typically the inflection point where steps add structure, cross-references, and validation beyond the basics.

## Depth Tags in Quality Criteria

Quality Criteria items may be tagged:
- `(mvp)` — applies at all depths (depth 1+)
- `(deep)` — applies only at depth 4+
- `(depth N+)` — applies at depth N and above

Untagged criteria apply at all depths by default.
