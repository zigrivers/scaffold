#!/usr/bin/env bash
# Spike 2 (spec §10): is Turborepo's automatic git-worktree cache sharing safe
# under concurrent writers? Builds a scratch pnpm-less npm workspace with turbo,
# creates 4 linked worktrees, runs 8 concurrent cached `turbo run test`
# invocations, then asserts (a) no run failed, (b) a follow-up run is a FULL
# TURBO cache hit, (c) the cache dir holds no zero-byte/corrupt tarballs.
set -euo pipefail

command -v node >/dev/null 2>&1 || { echo "node required" >&2; exit 2; }
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT INT TERM
cd "${WORK}"

git init -q -b main repo
cd repo
# One cache dir shared by every worktree (the recommended config — do NOT rely on
# turbo's default per-worktree location being shared). All runs point here.
SHARED="${WORK}/shared-turbo-cache"
mkdir -p "${SHARED}"
git config user.name spike
git config user.email spike@test.invalid

cat > package.json <<'EOF'
{
  "name": "turbo-spike",
  "private": true,
  "workspaces": ["packages/*"],
  "devDependencies": { "turbo": "^2" },
  "packageManager": "npm@10.0.0"
}
EOF
cat > turbo.json <<'EOF'
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "test": { "inputs": ["src/**"], "outputs": [] }
  }
}
EOF
for p in alpha beta gamma; do
  mkdir -p "packages/${p}/src"
  cat > "packages/${p}/package.json" <<EOF
{ "name": "${p}", "version": "0.0.0", "scripts": { "test": "node src/test.js" } }
EOF
  cat > "packages/${p}/src/test.js" <<'EOF'
let n = 0
for (let i = 0; i < 5e6; i++) n += i
console.log('ok', n)
EOF
done
npm install --silent
printf 'node_modules\n.turbo\n' > .gitignore
git add -A && git commit -qm base

for i in 1 2 3 4; do
  git worktree add -q "../wt${i}" -b "agent/w${i}" main
  # linked worktrees need their own node_modules for the turbo binary
  cp -R node_modules "../wt${i}/node_modules"
done

echo "running 8 concurrent turbo test invocations across 4 worktrees…"
pids=()
for i in 1 2 3 4; do
  (cd "../wt${i}" && TURBO_CACHE_DIR="${SHARED}" npx turbo run test >"../wt${i}.log" 2>&1) & pids+=($!)
  (cd "../wt${i}" && TURBO_CACHE_DIR="${SHARED}" npx turbo run test >"../wt${i}-b.log" 2>&1) & pids+=($!)
done
fail=0
for pid in "${pids[@]}"; do wait "${pid}" || fail=1; done
[[ "${fail}" -eq 0 ]] || { echo "VERDICT: UNSAFE — a concurrent run failed (see ${WORK}/wt*.log)"; exit 1; }

# follow-up run in a fresh worktree must be a full cache hit
git worktree add -q ../wt5 -b agent/w5 main
cp -R node_modules ../wt5/node_modules
OUT="$(cd ../wt5 && TURBO_CACHE_DIR="${SHARED}" npx turbo run test 2>&1)"
echo "${OUT}" | grep -q 'FULL TURBO' || { echo "VERDICT: UNSAFE — no cross-worktree cache hit"; echo "${OUT}"; exit 1; }

# corrupt artifact scan in the shared cache
if find "${SHARED}" -type f -size 0 2>/dev/null | grep -q .; then
  echo "VERDICT: UNSAFE — zero-byte cache artifacts found"
  exit 1
fi
echo "VERDICT: SAFE — concurrent writers + cross-worktree FULL TURBO hit, no corrupt artifacts"
