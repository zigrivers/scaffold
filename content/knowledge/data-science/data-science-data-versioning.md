---
name: data-science-data-versioning
description: When and how to version data for reproducibility — size-based rule for choosing between git+Parquet, git-lfs, and DVC
topics: [data-science, data-versioning, dvc, parquet, git-lfs]
---

If you can't answer "what data produced this result", you can't reproduce it.
A model trained on 2026-02-14's snapshot will drift from one trained today,
and without a versioning story you have no way to roll back, diff, or explain
the difference to a reviewer six months later.

Data versioning answers that question without blowing up the repo — the trick
is picking a tool proportional to the dataset size. The common failure mode
is over-engineering (wiring up DVC with a remote for a 40 MB CSV) or
under-engineering (committing 2 GB of Parquet directly into git and
discovering three months later that every clone takes twenty minutes).

## Summary

Pick your tool by size.

- Under ~1 GB of text or Parquet, plain git with committed Parquet files is fine.
- Between 1 and 10 GB, use `git-lfs` if you already use it on the team;
  otherwise invest in `DVC` (Data Version Control).
- Above 10 GB — or for any binary artifact (model weights, image corpora,
  audio) — always use DVC with a remote (s3, gcs, azure).
- Never version raw third-party data that you can't legally redistribute —
  store a fetch script and a content hash instead.

## Deep Guidance

### Size-based decision rule

| Dataset | Tool | Why |
|---------|------|-----|
| <1 GB text / Parquet | git + Parquet | Columnar compression keeps files small; git history stays sane |
| 1–10 GB (judgment call) | `git-lfs` if already adopted; DVC if you have the habit | LFS is lower-effort; DVC gives you pipeline stages too |
| >10 GB or binary artifacts | DVC with remote | Git history will not tolerate binary churn at this scale |
| Raw third-party data | Don't version — script + hash | Redistribution is often prohibited; raw bytes bloat history |

The sizes above are rules of thumb, not hard thresholds. What actually
matters is how often the data changes. A 5 GB file that you generate once
and never touch again can live in `git-lfs` forever without pain. The same
5 GB file regenerated weekly will accumulate 260 GB of LFS storage in a
year — that's the point where DVC's content-addressed cache starts to earn
its complexity.

A second factor is team shape. A solo researcher on a laptop rarely needs a
remote backing store; a two-person team on different continents almost
always does. Choose the tool that fits the smallest real collaboration
pattern you have, not the one that scales to the team you imagine having.

### When git + Parquet is enough

For a solo or small-team project with modest data, commit processed Parquet directly. Keep raw data out of the repo; reserve git for cleaned, analysis-ready files.

```python
# src/pipelines/clean.py
import pandas as pd

df = pd.read_csv("data/raw/events.csv")  # data/raw/ is gitignored
clean = df.dropna(subset=["user_id"]).assign(ts=pd.to_datetime(df["ts"]))
clean.to_parquet("data/interim/events_clean.parquet", compression="zstd")
```

```gitignore
# .gitignore
data/raw/
data/external/
*.csv
!data/interim/*.parquet   # do commit processed Parquet
```

Parquet's columnar layout and zstd compression typically shrink tabular data
5–10x versus CSV. Diffs aren't line-level but file-level content hashes are
stable, which is enough for "which version produced this model".

Pair the committed Parquet with a short data card — a markdown file in
`data/interim/events_clean.md` describing row count, schema, source, and the
commit that generated it — so readers of the repo a year later can tell what
they're looking at.

### DVC basics

DVC treats large files as pointers tracked in git. The real bytes live on a remote (s3/gcs/azure/ssh), and a small `.dvc` metadata file is committed.

```yaml
# dvc.yaml — pipeline stages with content-hashed inputs and outputs
stages:
  ingest:
    cmd: python src/ingest.py --out data/raw/events.parquet
    outs:
      - data/raw/events.parquet
  process:
    cmd: python src/process.py --in data/raw/events.parquet --out data/processed/features.parquet
    deps:
      - src/process.py
      - data/raw/events.parquet
    outs:
      - data/processed/features.parquet
```

Typical flow:

```bash
dvc init                              # creates .dvc/ directory
dvc remote add -d storage s3://my-bucket/dvc-store
dvc add data/raw/big_dataset.csv      # creates data/raw/big_dataset.csv.dvc (commit this)
dvc repro                             # runs stages whose inputs changed
dvc push                              # upload tracked files to remote
git add dvc.yaml dvc.lock data/raw/big_dataset.csv.dvc .gitignore
git commit -m "track raw events via DVC"
```

`dvc.lock` records the content hash of every stage input and output, so
`dvc repro` on a peer's machine rebuilds exactly what you rebuilt. The
`.dvc/` directory holds local cache and config; the actual bytes never touch
git.

Mental model: git for code, DVC for data, both pointing at the same commit.
When you check out an older branch, git restores the source and the `.dvc`
pointers, and `dvc checkout` pulls matching data from the remote into your
working tree.

A common starting point: track one or two heavy inputs with `dvc add` (no
pipeline), and only adopt `dvc.yaml` stages once you have a repeatable
multi-step workflow. The overhead of stages pays off when you have 3+ steps
and want `dvc repro` to skip unchanged work; below that, plain `dvc add`
plus a Makefile is often clearer.

### git-lfs middle ground

If you're already using Git LFS on the team but not ready to adopt DVC, it works acceptably for the 1–10 GB band — especially for a handful of files over the 100 MB GitHub push limit.

```gitattributes
# .gitattributes
*.parquet filter=lfs diff=lfs merge=lfs -text
*.pkl     filter=lfs diff=lfs merge=lfs -text
data/models/** filter=lfs diff=lfs merge=lfs -text
```

```bash
git lfs install
git lfs track "*.parquet"
git add .gitattributes data/features.parquet
git commit -m "add feature table via LFS"
```

Reach for `git-lfs` when files are over ~100 MB but you don't need DVC's
pipeline stages or content-addressed reproducibility. Skip it if you already
have DVC set up — two tools versioning the same data is a recipe for
confusion.

LFS has real drawbacks to know about: bandwidth is metered on hosted plans,
`git clone` pulls every LFS object by default (use `GIT_LFS_SKIP_SMUDGE=1`
to defer), and you can't selectively prune history without rewriting the
whole repo. For a working group of 2–5 people on a research project these
are usually tolerable; for a fleet of CI workers cloning on every build
they are not.

### What not to version

- **Third-party data with license constraints** — re-commit a fetch script (`scripts/fetch_kaggle.sh`) and record the SHA256 of the pulled file in a README. Re-download on each environment.
- **Regenerable intermediates** — if `dvc repro` or `make data` can recreate it deterministically from upstream inputs, don't commit the bytes.
- **Scratch / exploratory outputs** — `notebooks/scratch/`, `data/tmp/`, `*.ipynb_checkpoints/` belong in `.gitignore`.
- **Anti-pattern: committing 500 MB Parquet files directly to git** — they live forever in history, clone times balloon, and nobody will clean it up later. Move to DVC or LFS *before* the first large commit, not after. Rewriting history to extract large blobs (`git filter-repo`, BFG) is disruptive to every collaborator and should be a last resort.
- **Anti-pattern: versioning model checkpoints in git** — a single PyTorch checkpoint can be several hundred MB, and training runs produce dozens. Push them to DVC or an artifact store (MLflow, Weights & Biases) keyed by experiment run ID.

### Quick migration path

If you're staring at a repo that has already committed large files to plain
git, the order of operations is:

1. Decide the target tool (DVC for most cases where you got here).
2. Run `dvc add` on the file in its current location — this untracks it
   from git and creates a `.dvc` pointer.
3. Commit the pointer and the updated `.gitignore`.
4. Optionally run `git filter-repo` to purge the old blobs from history if
   clone size has become painful.

Step 4 requires coordination — everyone must re-clone — so defer it until
the pain justifies the disruption.

### Reproducibility in practice

The goal of all of this is a single concrete question: given a git commit,
can a teammate rebuild the exact model artifact that the commit describes?
Answer yes by pinning three things together:

- **Code** — the git commit itself.
- **Data** — a `.dvc` pointer, an LFS object, or a committed Parquet file,
  all content-hashed.
- **Environment** — a pinned `requirements.txt`, `pyproject.toml`, or
  `conda-lock.yml` committed in the same commit.

If any one of those three is missing, reproducibility is accidental. The
versioning tool you pick is less important than treating the three as a
single atomic unit — changed together, reviewed together, reverted together.
