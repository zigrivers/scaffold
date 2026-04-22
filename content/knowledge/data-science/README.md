# `data-science/` knowledge

Solo / small-team data-science domain knowledge injected into universal pipeline
steps by `content/methodology/data-science-overlay.yml`.

## Lockstep pairs with `ml/`

Five documents here mirror documents in `content/knowledge/ml/`. The two
overlays never compose at runtime (a user picks exactly one project type), but
edits to one side of a pair should trigger review of the other to prevent
recommendation drift over time:

| `data-science/`                         | `ml/`                            |
| --------------------------------------- | -------------------------------- |
| `data-science-experiment-tracking.md`   | `ml-experiment-tracking.md`      |
| `data-science-model-evaluation.md`      | `ml-model-evaluation.md`         |
| `data-science-observability.md`         | `ml-observability.md`            |
| `data-science-requirements.md`          | `ml-requirements.md`             |
| `data-science-conventions.md`           | `ml-conventions.md`              |

`ml/` targets production training and serving systems. `data-science/` targets
solo / small-team analytics and prototyping. Tool picks may diverge where the
audience justifies it (e.g. MLflow self-hosted vs managed W&B).
