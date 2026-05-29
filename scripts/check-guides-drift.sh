#!/usr/bin/env bash
set -euo pipefail

# Regenerate all guides + index, then fail if the working tree changed
# (generated HTML is checked in).
node dist/index.js guides --build

if ! git diff --quiet -- content/guides; then
  echo "ERROR: generated guide HTML is stale. Run 'scaffold guides --build' and commit." >&2
  git --no-pager diff --stat -- content/guides >&2
  exit 1
fi

# Also catch untracked (newly generated) files in content/guides
untracked="$(git ls-files --others --exclude-standard content/guides)"
if [[ -n "${untracked}" ]]; then
  echo "ERROR: untracked generated guide files. Run 'scaffold guides --build' and commit." >&2
  echo "${untracked}" >&2
  exit 1
fi

# Security scan over every generated guide HTML:
#   - no <script> outside the known inlined chrome blocks (we strip <script>...</script> first)
#   - no inline on*= event handlers
#   - no javascript: URIs
#   - no external src="http(s):"
#   - no DANGEROUS style= content. Inline style attributes are allowed (chart
#     bars emit style="width:N%"; sanitized mermaid SVGs carry harmless
#     presentation styles like max-width / stroke-width). We reject only the
#     real execution/exfiltration vectors: url(), expression(), javascript:,
#     and @import inside a style attribute.
fail=0
while IFS= read -r html; do
  # strip ALL <script>...</script> blocks (the inlined chrome bundles)
  body="$(perl -0777 -pe 's/<script>.*?<\/script>//sg' "${html}")"
  if grep -qiE '<script' <<<"${body}"; then echo "FAIL ${html}: unexpected <script>"; fail=1; fi
  if grep -qiE '\son[a-z]+=' <<<"${body}"; then echo "FAIL ${html}: inline event handler"; fail=1; fi
  if grep -qiE 'javascript:' <<<"${body}"; then echo "FAIL ${html}: javascript: uri"; fail=1; fi
  if grep -qiE 'src="https?:' <<<"${body}"; then echo "FAIL ${html}: external src"; fail=1; fi
  if grep -oiE 'style=("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]>]+)' <<<"${body}" | grep -qiE 'url\(|expression|javascript:|@import|position[[:space:]]*:[[:space:]]*(fixed|absolute)'; then
    echo "FAIL ${html}: dangerous style attribute content"; fail=1; fi
done < <(find content/guides -name '*.html' || true)

if [[ "${fail}" -ne 0 ]]; then echo "Security scan failed." >&2; exit 1; fi
echo "Guides drift + security scan passed."
