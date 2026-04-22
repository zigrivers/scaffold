---
name: data-science-notebook-discipline
description: Notebook discipline for reproducible data science — Marimo as primary, Jupyter plus jupytext as fallback, promoting working cells to tested modules
topics: [data-science, notebooks, marimo, jupyter, reproducibility]
---

Every data scientist has shipped a notebook that "worked for me in a session" and then produced different numbers the next morning — or worse, different numbers in a colleague's environment or a production run. The usual cause is not a bug in the code; it is hidden state. Jupyter cells can be executed in any order, re-run selectively, or silently depend on variables that were defined in a cell that has since been edited or deleted. The kernel's in-memory state becomes the real program, and the `.ipynb` file is just a partial, sometimes misleading, transcript. For solo and small-team DS work, this is the single biggest source of "it worked yesterday" pain, and it is entirely avoidable with the right tooling and habits.

## Summary

Use **Marimo** as your primary notebook tool: the file format is pure `.py` (git-diffable), execution is reactive (editing a cell re-runs its downstream dependents automatically), and there is no hidden-cell-order hazard by construction. When you cannot switch — existing Jupyter investment, team inertia, library widgets that only work in classic Jupyter — pair every `.ipynb` with a `.py` via **jupytext** and commit the `.py`. Either way, the key discipline is promotion: when a cell works, extract it to `src/<module>.py`, write a test, and import it back. Run finished notebooks as pipelines with `marimo run` or `papermill`.

## Deep Guidance

### The hidden-state problem

Classic Jupyter lets you execute cells in any order. Consider this sequence:

1. Cell A defines `df = pd.read_csv("raw.csv")`.
2. Cell B defines `df = df.dropna()`.
3. You run A, then B, then A again.
4. `df` is now the raw frame — but cell B's output cell still shows the cleaned version, and any downstream cell that already ran still has the cleaned `df` cached in its own computation.

Nothing about the notebook on disk reveals this inconsistency. "Restart kernel and run all" is the only way to prove a notebook is reproducible, and most DS workflows skip that step for months at a time. Outputs are cached in the `.ipynb`, so a reader sees plausible numbers and has no signal that the state is corrupt. This is **hidden state** — the kernel's memory diverges from the code as written, and the notebook lies about what it computed.

Second-order effects make it worse: merge conflicts on `.ipynb` JSON are unreadable; diffs show base64 image blobs; collaborators re-run cells in different orders and get different results. The notebook as a unit of collaboration is broken unless you impose discipline from outside.

### Marimo as primary

[Marimo](https://marimo.io) is a reactive Python notebook that solves hidden state at the architecture level. Each notebook is a pure `.py` file; cells form a dependency graph; when you edit a cell, Marimo re-runs all of its dependents automatically. There is no way for the displayed state to diverge from what the code computes, because the runtime enforces topological order on every edit.

A minimal Marimo notebook looks like this — note it is ordinary Python you can read in any editor:

```python
# notebook.py
import marimo as mo

app = mo.App()

@app.cell
def __():
    import pandas as pd
    df = pd.read_csv("data/raw.csv")
    return (df,)

@app.cell
def __(df):
    clean = df.dropna()
    mo.md(f"Rows: **{len(clean)}**")
    return (clean,)
```

Key commands:

- `marimo edit notebook.py` — opens the reactive editor in your browser
- `marimo run notebook.py` — serves the notebook as a read-only web app (great for stakeholders)
- `marimo export html notebook.py -o out.html` — static HTML snapshot for reports

Because the file is `.py`, `git diff` shows real code changes. Code review on a Marimo notebook works the same as code review on any Python file. There are no output cells to strip, no JSON diffs to parse.

### Jupyter plus jupytext fallback

When Marimo is not an option — you depend on a Jupyter-only widget, you share notebooks with non-Marimo users, or your infrastructure is built around `.ipynb` — use **jupytext** to pair each `.ipynb` with a `.py` representation. Install jupytext, then configure pairing at the repo root:

```toml
# .jupytext.toml
formats = "ipynb,py:percent"
notebook_metadata_filter = "-all"
cell_metadata_filter = "-all"
```

Or pair a single notebook explicitly:

```bash
jupytext --set-formats ipynb,py:percent notebooks/eda.ipynb
```

The `py:percent` format splits cells with `# %%` markers and produces a clean, diffable Python file. Rule of thumb for the repo:

- **Commit** the `.py` version — it is the source of truth for review and diffs
- **Gitignore** the `.ipynb` (or commit it with `nbstripout` installed to strip outputs; see the data-science-security doc for the outputs-as-secrets angle)
- **Do not** try to keep both hand-edited — jupytext's pre-save hook keeps them in sync automatically

This does not fix hidden state (Jupyter still runs cells in click-order), but it does make review and merges sane, and it gives you a textual artifact that survives kernel-state bugs.

### Promotion: notebook to src to test to re-import

The most important habit in any notebook workflow — Marimo or Jupyter — is **promotion**. The moment a cell does real work, extract it to a tested module and import it back.

Before (inline in the notebook, untested, untyped):

```python
@app.cell
def __(df):
    df["hour"] = pd.to_datetime(df["ts"]).dt.hour
    df["is_weekend"] = pd.to_datetime(df["ts"]).dt.dayofweek >= 5
    df["log_amount"] = np.log1p(df["amount"])
    return (df,)
```

After — extract to `src/features/engineer.py`:

```python
# src/features/engineer.py
import numpy as np
import pandas as pd

def add_time_features(df: pd.DataFrame, ts_col: str = "ts") -> pd.DataFrame:
    """Add hour and is_weekend columns derived from a timestamp column."""
    out = df.copy()
    ts = pd.to_datetime(out[ts_col])
    out["hour"] = ts.dt.hour
    out["is_weekend"] = ts.dt.dayofweek >= 5
    return out

def add_log_amount(df: pd.DataFrame, amount_col: str = "amount") -> pd.DataFrame:
    out = df.copy()
    out["log_amount"] = np.log1p(out[amount_col])
    return out
```

Write a test — small, fast, no data dependency:

```python
# tests/features/test_engineer.py
import pandas as pd
from src.features.engineer import add_time_features

def test_weekend_flag_friday_vs_saturday():
    df = pd.DataFrame({"ts": ["2026-04-17 10:00", "2026-04-18 10:00"]})
    out = add_time_features(df)
    assert out["is_weekend"].tolist() == [False, True]
```

Re-import in the notebook:

```python
@app.cell
def __(df):
    from src.features.engineer import add_time_features, add_log_amount
    df = add_log_amount(add_time_features(df))
    return (df,)
```

The notebook becomes a thin orchestration + visualization layer over tested modules. Hidden state matters less because the logic lives in files that are exercised by CI. Pull requests become reviewable — the reviewer reads typed functions with tests, not a wall of chained DataFrame mutations.

### Running notebooks as pipelines

Finished notebooks often need to run on a schedule — daily reports, weekly retraining, monthly audits. Do not copy-paste the code into a script; run the notebook directly.

**Marimo**: because the file is already Python, you can run it as a script or as an app:

```bash
marimo run notebook.py                    # serve as web app
python notebook.py                        # execute top-to-bottom as a plain script
marimo export html notebook.py -o out.html # produce a static report artifact
```

**Jupyter**: use `papermill` to parameterize and execute an `.ipynb`, producing an executed output notebook:

```bash
papermill notebooks/weekly_report.ipynb \
          outputs/report_$(date +%Y%m%d).ipynb \
          -p start_date 2026-04-14 \
          -p end_date 2026-04-20
```

Parameterized cells (tagged `parameters` in Jupyter) are injected by papermill at the top of the run. Use Marimo's `mo.cli_args()` for the equivalent in Marimo. Either way, pair this with a lightweight scheduler (cron, GitHub Actions, Airflow, Prefect) — the notebook is the unit of work, not a script that tries to re-implement it.

A useful rule: if a notebook is scheduled to run unattended, its logic should be ~90% imports from `src/` and ~10% glue. The promotion discipline from the previous section is what makes scheduled notebook runs trustworthy.
