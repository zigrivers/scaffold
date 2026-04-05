---
name: game-binary-vcs-strategy
description: Git LFS deep dive, Perforce and PlasticSCM comparison, large repo tuning, lock protocols, CI for binary assets, VCS selection guide
topics: [game-dev, vcs, git-lfs, perforce, binary-assets]
---

Game development produces enormous volumes of binary assets — textures, meshes, audio, animations, and engine-specific formats — that fundamentally break assumptions baked into distributed version control systems like Git. A single Unreal project can exceed 100 GB of binary data that cannot be diffed, merged, or compressed efficiently. Choosing the right VCS strategy, configuring it correctly, and establishing team protocols around binary file workflows is a prerequisite for any multi-person game project. The wrong choice creates daily friction that compounds into weeks of lost productivity over a production cycle.

## Summary

### The Binary Asset Problem

Standard Git was designed for text files. It stores full copies of every version of every file, diffs them line-by-line, and merges them with three-way text merge. Binary files break all three assumptions:

- **No meaningful diffs**: A 50 MB texture changed by an artist produces a 50 MB delta that conveys no human-readable information
- **No merging**: Two artists editing the same Maya file simultaneously will always produce a conflict that cannot be auto-resolved
- **Repository bloat**: Without special handling, every revision of every binary file lives in the Git object store forever, making clones take hours and disk usage grow without bound

### VCS Options for Game Projects

Three primary approaches exist, each with distinct tradeoffs:

1. **Git + Git LFS** — Uses Git for code and metadata, offloads binary files to a separate LFS server. Best for teams already fluent in Git workflows who need binary support.

2. **Perforce (Helix Core)** — Centralized VCS built for binary-heavy workflows from the ground up. Industry standard for AAA studios. Excellent file locking, workspace views, and stream-based branching.

3. **PlasticSCM (Unity Version Control)** — Hybrid centralized/distributed VCS with visual merge tools, strong binary handling, and deep Unity integration. Now owned by Unity Technologies.

### When to Use Each

- **Git LFS**: Teams under 20, binary content under 50 GB, strong Git familiarity, open-source or indie projects, GitHub/GitLab CI pipelines already established
- **Perforce**: Teams over 20, binary content over 100 GB, AAA/console projects, need exclusive file checkout enforcement, multiple offices with proxy servers
- **PlasticSCM**: Unity-centric teams, desire for visual diff/merge tools for prefabs and scenes, teams wanting centralized locking with distributed code workflows

### Key Decision Factors

- **Team size**: Larger teams need stronger locking enforcement — Perforce excels here
- **Repository size**: Git LFS has practical limits around 50–100 GB before clone/fetch times become painful; Perforce handles terabyte-scale repos routinely
- **Platform familiarity**: Forcing a Git-native team onto Perforce (or vice versa) creates onboarding friction
- **CI/CD integration**: Git-based CI (GitHub Actions, GitLab CI) integrates trivially with Git LFS; Perforce requires dedicated CI setup
- **Cost**: Git LFS is free (server hosting costs apply); Perforce is free for up to 5 users/20 workspaces; PlasticSCM is free for up to 3 users with Unity subscription

## Deep Guidance

### Git LFS Deep Dive

Git LFS replaces large files with lightweight pointer files in the Git repository, storing the actual file content on a separate LFS server (GitHub LFS, GitLab LFS, Azure DevOps, or self-hosted).

**How it works:**
1. `.gitattributes` rules designate which file patterns are LFS-tracked
2. On `git add`, LFS replaces the file content with a ~130-byte pointer containing the SHA-256 hash
3. The actual file is stored in `.git/lfs/objects/` locally and uploaded to the LFS server on push
4. On `git checkout`, LFS downloads the actual file content and replaces the pointer in the working directory

**Initial setup for a game project:**

```bash
# Initialize LFS in the repository (run once)
git lfs install

# Track binary file types BEFORE adding any binary files
# This creates/updates .gitattributes
git lfs track "*.png" "*.jpg" "*.tga" "*.psd" "*.exr"
git lfs track "*.fbx" "*.blend" "*.mb" "*.ma" "*.obj"
git lfs track "*.wav" "*.ogg" "*.mp3" "*.flac"
git lfs track "*.uasset" "*.umap"
git lfs track "*.unity" "*.prefab" "*.asset"
git lfs track "*.mp4" "*.mov"
git lfs track "*.dll" "*.so" "*.dylib"

# CRITICAL: Commit .gitattributes FIRST, before adding binary files
git add .gitattributes
git commit -m "chore: configure Git LFS tracking for game assets"

# Verify tracking
git lfs track
# Should list all patterns from .gitattributes

# Check LFS status
git lfs status
```

**LFS locking for team workflows:**

```bash
# Enable locking on the server (GitHub, GitLab, etc.)
# Mark file types as lockable in .gitattributes
# (See game-asset-pipeline knowledge entry for full .gitattributes template)

# Lock a file before editing
git lfs lock "Content/Textures/T_Hero_D.png"

# See all current locks
git lfs locks

# See locks held by a specific user
git lfs locks --user="artist@studio.com"

# Unlock after pushing changes
git lfs unlock "Content/Textures/T_Hero_D.png"

# Admin force-unlock (when someone is unavailable)
git lfs unlock --force "Content/Textures/T_Hero_D.png"

# Verify all locks in CI (fail if stale locks exist)
# stale_locks.sh — run in CI on a schedule
STALE_THRESHOLD_HOURS=48
git lfs locks --json | python3 -c "
import json, sys
from datetime import datetime, timezone, timedelta
locks = json.load(sys.stdin)
threshold = datetime.now(timezone.utc) - timedelta(hours=$STALE_THRESHOLD_HOURS)
stale = [l for l in locks if datetime.fromisoformat(l['locked_at'].replace('Z','+00:00')) < threshold]
if stale:
    for l in stale:
        print(f\"STALE LOCK: {l['path']} by {l['owner']['name']} since {l['locked_at']}\")
    sys.exit(1)
print(f'No stale locks (checked {len(locks)} active locks)')
"
```

### LFS Performance Tuning

Large repositories with Git LFS require tuning to maintain reasonable performance.

**Bandwidth and transfer optimization:**

```bash
# Increase concurrent LFS transfers (default is 3)
git config lfs.concurrenttransfers 8

# Enable LFS transfer queue batching
git config lfs.batch true

# Set transfer timeout for large files (seconds)
git config lfs.activitytimeout 60

# Use SSH transfer for better performance on some servers
git config lfs.url "ssh://git@github.com/org/repo.git"

# For partial clones — only download LFS objects you need
# Clone without downloading ANY LFS objects
GIT_LFS_SKIP_SMUDGE=1 git clone <repo-url>
# Then fetch only the LFS objects for your current checkout
git lfs pull

# For CI: only fetch LFS objects that changed in the PR
git lfs fetch origin main --recent
git lfs checkout
```

**Repository maintenance:**

```bash
# Prune old LFS objects not referenced by recent commits
git lfs prune

# Verify LFS object integrity
git lfs fsck

# Migrate existing binary files into LFS (if LFS was added late)
# WARNING: This rewrites history — coordinate with the entire team
git lfs migrate import --include="*.png,*.fbx,*.wav" --everything

# Check LFS storage usage
git lfs ls-files -s | awk '{sum += $1} END {print sum/1024/1024 " MB"}'
```

### Perforce (Helix Core) for Game Development

Perforce is the industry standard for AAA game studios. Its centralized model eliminates the binary merge problem by design — only one person can check out an exclusive file at a time.

**Key advantages over Git LFS:**
- **Native exclusive checkout**: Files marked as exclusive can only be edited by one person at a time, enforced server-side. No need for manual locking discipline.
- **Workspace views**: Users sync only the files they need. An artist can exclude all code; a programmer can exclude all raw art. Reduces local disk usage dramatically.
- **Streams**: Branching model designed for game development with mainline, development, and release streams that handle binary assets correctly.
- **Proxy servers**: Perforce Proxy caches frequently accessed file revisions at remote offices, reducing WAN traffic for distributed teams.
- **Scale**: Perforce routinely handles repositories with millions of files and terabytes of content. Google's monorepo runs on a Perforce fork (Piper).

**Key disadvantages:**
- **Centralized model**: Requires constant server connectivity for most operations. Offline work is limited.
- **Learning curve**: Perforce concepts (workspaces, changelists, streams, typemaps) differ significantly from Git. Teams fluent in Git face a ramp-up period.
- **Cost**: Free for up to 5 users/20 workspaces. Beyond that, per-seat licensing adds up for large teams.
- **CI complexity**: Most modern CI systems (GitHub Actions, GitLab CI) are Git-native. Perforce integration requires dedicated plugins or custom scripting.

**Perforce typemap for game assets:**

```
# Perforce typemap — add to server configuration
# Controls how file types are stored and locked

Typemap:
    binary+lFS4 //depot/....png
    binary+lFS4 //depot/....jpg
    binary+lFS4 //depot/....tga
    binary+lFS4 //depot/....psd
    binary+lFS4 //depot/....exr
    binary+lFS4 //depot/....fbx
    binary+lFS4 //depot/....blend
    binary+lFS4 //depot/....mb
    binary+lFS4 //depot/....ma
    binary+lFS4 //depot/....wav
    binary+lFS4 //depot/....ogg
    binary+lFS4 //depot/....mp3
    binary+lFS4 //depot/....uasset
    binary+lFS4 //depot/....umap
    text //depot/....cs
    text //depot/....cpp
    text //depot/....h
    text //depot/....py
    text //depot/....json
    text //depot/....yaml
    text //depot/....yml
    text //depot/....md
    text //depot/....xml

# Flags explanation:
# l = exclusive lock (only one checkout at a time)
# F = store full file (no delta compression for binaries)
# S4 = keep only last 4 revisions server-side (saves storage)
```

### PlasticSCM (Unity Version Control)

PlasticSCM offers a middle ground — centralized locking like Perforce with distributed branching like Git, plus visual merge tools that understand Unity-specific file formats.

**Key advantages:**
- **Unity integration**: Built-in to Unity Editor. Artists and designers can lock, check out, and commit without leaving Unity.
- **Visual merge for Unity files**: Can merge `.prefab`, `.unity`, and `.asset` files with a visual tool that understands the YAML serialization format.
- **Branch explorer**: Visual branch/merge history that is more intuitive than `git log --graph` for non-programmers.
- **Distributed + centralized**: Developers can work distributed (like Git); artists can work centralized (like Perforce). Same repository, different workflows.

**Key disadvantages:**
- **Unity-centric**: Integration with Unreal or Godot is minimal. Non-Unity projects lose the main selling point.
- **Smaller ecosystem**: Fewer third-party integrations, tutorials, and community support compared to Git or Perforce.
- **Ownership uncertainty**: Unity Technologies acquired PlasticSCM; its long-term roadmap is tied to Unity's business decisions.

### Hybrid Strategies

Many studios use a hybrid approach — Git for code, a separate system for art:

**Git (code) + Perforce (art):**
- Programmers use Git with their existing workflows, branching, and CI
- Artists use Perforce for binary assets with exclusive checkout
- A build system assembles both repositories into a single build
- Complexity: two systems to maintain, two sets of access controls, potential sync issues

**Git LFS with strict locking + submodules:**
- Main repository contains code and metadata
- Binary assets live in a separate Git LFS repository added as a submodule
- Allows different clone/fetch strategies per repository
- CI checks out code repo normally, does a shallow/sparse checkout of the asset repo

**Decision framework:**

```yaml
# vcs_decision.yaml — Evaluate and document your VCS choice

project:
  team_size: 8
  binary_content_gb: 25
  engine: unity
  ci_platform: github_actions
  distributed_team: false

evaluation:
  git_lfs:
    score: 8
    pros:
      - team already knows Git (10 years collective experience)
      - GitHub Actions CI pipeline is established
      - repository size (25 GB) within LFS comfort zone
      - free with GitHub plan
    cons:
      - locking requires discipline (not enforced by default)
      - clone time will grow as asset count increases
      - no partial workspace (must clone entire repo)
    mitigations:
      - pre-commit hook to verify locks before edit
      - CI stale lock detection
      - document LFS partial clone for CI

  perforce:
    score: 5
    pros:
      - exclusive checkout prevents binary conflicts by design
      - workspace views allow partial sync
    cons:
      - team has zero Perforce experience
      - CI pipeline would need complete rebuild
      - cost for 8 users exceeds git hosting
      - overkill for 25 GB repository
    mitigations:
      - training budget for team onboarding
      - Perforce CI plugins exist for Jenkins

  plastic_scm:
    score: 7
    pros:
      - Unity integration is excellent
      - visual merge tools for .prefab files
      - locking + distributed hybrid
    cons:
      - CI integration less mature than Git
      - team would need to learn new tool
    mitigations:
      - in-Unity workflow reduces learning curve for artists

  decision: git_lfs
  rationale: >
    Team Git expertise, existing CI pipeline, and moderate repo size
    make Git LFS the lowest-friction choice. Locking discipline will
    be enforced via hooks and CI checks rather than relying on
    server-side enforcement.
```

### CI Integration for Binary Assets

Binary assets require CI attention beyond code linting and unit tests.

**Pre-commit checks:**
- Verify no binary files are committed outside LFS tracking (check for large files in the Git object store)
- Validate file naming conventions
- Ensure locked files are actually locked by the committer

**Build pipeline:**
- Asset cooking/import validation (textures compressed, meshes within budget)
- Build size tracking — alert if build size grows by more than 5% in a single PR
- Orphaned asset detection — find assets not referenced by any scene or prefab

```bash
#!/usr/bin/env bash
# ci_binary_checks.sh — Binary asset validation for CI

set -euo pipefail

echo "=== Checking for binary files outside LFS ==="
# Find files larger than 1MB that are NOT tracked by LFS
git diff --cached --name-only --diff-filter=ACM | while read -r file; do
    if [ -f "$file" ]; then
        size=$(wc -c < "$file")
        if [ "$size" -gt 1048576 ]; then  # 1 MB
            # Check if file is LFS-tracked
            if ! git lfs ls-files --name-only | grep -qF "$file"; then
                echo "ERROR: $file is ${size} bytes and NOT tracked by LFS"
                echo "  Add to .gitattributes: $(basename "$file" | sed 's/.*\./\*./')" \
                     "filter=lfs diff=lfs merge=lfs -text"
                exit 1
            fi
        fi
    fi
done

echo "=== Checking LFS pointer integrity ==="
# Verify all LFS pointers resolve to actual objects
git lfs ls-files --name-only | head -20 | while read -r lfs_file; do
    if [ -f "$lfs_file" ]; then
        if head -1 "$lfs_file" 2>/dev/null | grep -q "^version https://git-lfs"; then
            echo "WARNING: $lfs_file is still a pointer (LFS content not fetched)"
        fi
    fi
done

echo "=== Checking build size delta ==="
if [ -f "build_size_baseline.txt" ]; then
    baseline=$(cat build_size_baseline.txt)
    # This would be replaced with actual build size measurement
    echo "Baseline build size: ${baseline} MB"
fi

echo "All binary asset checks passed."
```

### Large Repository Performance Strategies

As game repositories grow, several strategies maintain developer productivity:

**Shallow clones for CI:**
- `git clone --depth=1` reduces clone time dramatically (only latest commit)
- Combined with `GIT_LFS_SKIP_SMUDGE=1`, avoids downloading any LFS content until explicitly requested
- CI then fetches only the LFS objects needed for the current build

**Sparse checkout:**
- `git sparse-checkout` lets developers clone only subdirectories they need
- An artist working on Level 3 does not need Level 1 or Level 2 assets locally
- Reduces local disk usage from hundreds of GB to the relevant working set

**LFS file caching:**
- Deploy a local LFS cache server (or Perforce Proxy) for studios with multiple developers on a LAN
- First developer to fetch an LFS object caches it; subsequent developers pull from cache
- Reduces external bandwidth by 80–90% in office environments

**Worktree strategy for binary-heavy repos:**
- Avoid multiple full clones for parallel work — use `git worktree` to share the object store
- Each worktree shares the same LFS cache, avoiding duplicate downloads
- Particularly valuable for code review checkouts alongside active development
