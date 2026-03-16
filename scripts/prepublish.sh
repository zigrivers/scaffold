#!/usr/bin/env bash
set -euo pipefail

echo "Running prepublish checks..."
npm run build
npm test
echo "Prepublish checks passed."
