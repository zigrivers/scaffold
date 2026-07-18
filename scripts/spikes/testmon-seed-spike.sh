#!/usr/bin/env bash
# Spike 3 (spec §10): does copying a warmed .testmondata into a fresh checkout
# give correct affected-selection, and does history rewriting (rebase-like
# churn) degrade gracefully (fall back to running more, never crash)?
set -euo pipefail

command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 2; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM
cd "${WORK}"

python3 -m venv venv
./venv/bin/pip install --quiet pytest pytest-testmon

mkdir -p proj/src proj/tests
cat > proj/src/mod_a.py <<'EOF'
def add(a, b):
    return a + b
EOF
cat > proj/src/mod_b.py <<'EOF'
def mul(a, b):
    return a * b
EOF
cat > proj/tests/test_a.py <<'EOF'
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from mod_a import add
def test_add():
    assert add(1, 2) == 3
EOF
cat > proj/tests/test_b.py <<'EOF'
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from mod_b import mul
def test_mul():
    assert mul(2, 3) == 6
EOF

cd proj
# Warm the DB (full run)
../venv/bin/python -m pytest --testmon -q | tail -1

# "Worktree": copy of the project including the warmed .testmondata
cd ..
cp -R proj wt1
# Touch only mod_a in the worktree
cat > wt1/src/mod_a.py <<'EOF'
def add(a, b):
    return int(a) + int(b)
EOF
# -v so we verify WHICH test ran, not just a count — a stale selector that runs
# the wrong test would satisfy a bare "1 passed".
OUT="$(cd wt1 && ../venv/bin/python -m pytest --testmon -v 2>&1 | tail -12)"
echo "${OUT}"
echo "${OUT}" | grep -qiE 'test_a\.py::test_add.*(passed|ok)' \
  || { echo "VERDICT: DEGRADED — seeded selection did not include the affected test (test_a)"; exit 1; }
echo "${OUT}" | grep -qiE 'test_b\.py::test_mul.*(passed|ok)' \
  && { echo "VERDICT: DEGRADED — selection did not narrow: ran the unaffected test_b too"; exit 1; }

# Rebase churn: reset mod_a, replace mod_b content wholesale (simulates history
# rewrite). The affected run must re-select the CHANGED test (mod_b -> test_b);
# running only test_a here would be a silent mis-selection, not degradation.
cp proj/src/mod_a.py wt1/src/mod_a.py
cat > wt1/src/mod_b.py <<'EOF'
def mul(a, b):
    return (a * b) + 0
EOF
OUT2="$(cd wt1 && ../venv/bin/python -m pytest --testmon -v 2>&1 | tail -12)"
echo "${OUT2}"
echo "${OUT2}" | grep -qiE 'test_b\.py::test_mul.*(passed|ok)' \
  || { echo "VERDICT: DEGRADED — post-churn run did not include the changed test (test_b)"; exit 1; }
echo "VERDICT: SEEDING WORKS — warm-DB copy narrows selection; churn degrades to re-running, never crashing"
