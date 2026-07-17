#!/usr/bin/env bash
# Spike 1 (spec D9): does sequential `gh pr merge --squash` reproduce the tree
# of locally squash-applying the same PRs in the same order onto the same base?
# Creates a throwaway PRIVATE repo under the authenticated user, runs 3 cases,
# prints a verdict, deletes the repo. Requires: gh auth with repo scope
# (deletion needs delete_repo scope: gh auth refresh -h github.com -s delete_repo).
set -euo pipefail

command -v gh >/dev/null 2>&1 || { echo "gh CLI required" >&2; exit 2; }

SUFFIX="$(date -u +%s)"
REPO_NAME="mq-squash-spike-${SUFFIX}"
OWNER="$(gh api user -q .login)"
WORK="$(mktemp -d)"
cleanup() {
  gh repo delete "${OWNER}/${REPO_NAME}" --yes 2>/dev/null || \
    echo "NOTE: could not delete ${OWNER}/${REPO_NAME} — delete manually (needs delete_repo scope)" >&2
  rm -rf "${WORK}"
}
trap cleanup EXIT INT TERM

gh repo create "${REPO_NAME}" --private --clone=false >/dev/null
git init -q "${WORK}/repo"
cd "${WORK}/repo"
git config user.name mq-spike
git config user.email mq-spike@example.invalid
echo base > base.txt
git add base.txt && git commit -qm "base"
git branch -M main
git remote add origin "https://github.com/${OWNER}/${REPO_NAME}.git"
git push -qu origin main

make_pr() { # name, file, content -> prints PR number
  local name="$1" file="$2" content="$3"
  git checkout -qb "${name}" main
  echo "${content}" > "${file}"
  git add "${file}" && git commit -qm "${name}"
  git push -qu origin "${name}"
  gh pr create --head "${name}" --title "${name}" --body "spike" >/dev/null
  gh pr view "${name}" --json number -q .number
  git checkout -q main
}

PR_A="$(make_pr pr-a a.txt alpha)"
PR_B="$(make_pr pr-b b.txt beta)"
# Case B: pr-c contains a merge commit from main (main moved after branching)
git checkout -qb pr-c main
echo gamma > c.txt
git add c.txt && git commit -qm "pr-c work"
git checkout -q main
echo moved > moved.txt
git add moved.txt && git commit -qm "main moves"
git push -q origin main
git checkout -q pr-c
git merge -q --no-edit main
git push -qu origin pr-c
gh pr create --head pr-c --title pr-c --body "spike" >/dev/null
PR_C="$(gh pr view pr-c --json number -q .number)"
git checkout -q main && git pull -q origin main

# Local candidate: squash-apply A, B, C in order onto current origin/main
git fetch -q origin
git checkout -qb candidate origin/main
for ref in pr-a pr-b pr-c; do
  git merge -q --squash "origin/${ref}"
  git commit -qm "squash ${ref}"
done
LOCAL_TREE="$(git rev-parse 'candidate^{tree}')"

# Land the same PRs the daemon's way, in the same order
for pr in "${PR_A}" "${PR_B}" "${PR_C}"; do
  gh pr merge "${pr}" --squash --delete-branch
done
git fetch -q origin
REMOTE_TREE="$(git rev-parse 'origin/main^{tree}')"

echo "local candidate tree:  ${LOCAL_TREE}"
echo "post-land origin tree: ${REMOTE_TREE}"
if [[ "${LOCAL_TREE}" = "${REMOTE_TREE}" ]]; then
  echo "VERDICT: MATCH — D9 landing design confirmed"
else
  echo "VERDICT: MISMATCH — use D9 fallback (direct-push landing)"
  exit 1
fi
