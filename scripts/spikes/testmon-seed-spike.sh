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
OUT="$(cd wt1 && ../venv/bin/python -m pytest --testmon -q 2>&1 | tail -3)"
echo "${OUT}"
echo "${OUT}" | grep -q '1 passed' || { echo "VERDICT: DEGRADED — seeded selection did not narrow to the affected test"; exit 1; }

# Rebase churn: replace file content wholesale (simulates history rewrite)
cp proj/src/mod_a.py wt1/src/mod_a.py
cat > wt1/src/mod_b.py <<'EOF'
def mul(a, b):
    return (a * b) + 0
EOF
OUT2="$(cd wt1 && ../venv/bin/python -m pytest --testmon -q 2>&1 | tail -3)"
echo "${OUT2}"
echo "${OUT2}" | grep -qE '(1 passed|2 passed)' || { echo "VERDICT: DEGRADED — post-churn run failed"; exit 1; }
echo "VERDICT: SEEDING WORKS — warm-DB copy narrows selection; churn degrades to re-running, never crashing"
