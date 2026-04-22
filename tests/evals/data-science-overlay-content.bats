#!/usr/bin/env bats
# tests/evals/data-science-overlay-content.bats
#
# Keyword-presence spot checks for data-science knowledge docs. Guards against
# a future edit hollowing out a document. NOT a substitute for human review.

PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
KB_DIR="${PROJECT_ROOT}/content/knowledge/data-science"

@test "data-science-experiment-tracking mentions MLflow" {
  grep -q 'MLflow' "${KB_DIR}/data-science-experiment-tracking.md"
}

@test "data-science-notebook-discipline mentions Marimo" {
  grep -q 'Marimo' "${KB_DIR}/data-science-notebook-discipline.md"
}

@test "data-science-data-versioning mentions DVC" {
  grep -q 'DVC' "${KB_DIR}/data-science-data-versioning.md"
}

@test "data-science-dev-environment mentions uv" {
  grep -qE '\buv\b' "${KB_DIR}/data-science-dev-environment.md"
}

@test "data-science-testing mentions pytest and pandera" {
  grep -q 'pytest' "${KB_DIR}/data-science-testing.md"
  grep -q 'pandera' "${KB_DIR}/data-science-testing.md"
}

@test "data-science-model-evaluation mentions calibration" {
  grep -q 'calibration' "${KB_DIR}/data-science-model-evaluation.md"
}

@test "data-science-observability mentions Evidently" {
  grep -q 'Evidently' "${KB_DIR}/data-science-observability.md"
}

@test "data-science-reproducibility mentions PYTHONHASHSEED" {
  grep -q 'PYTHONHASHSEED' "${KB_DIR}/data-science-reproducibility.md"
}

@test "data-science-architecture mentions Polars and Pandas" {
  grep -q 'Polars' "${KB_DIR}/data-science-architecture.md"
  grep -q 'Pandas' "${KB_DIR}/data-science-architecture.md"
}

@test "data-science-security mentions PII" {
  grep -q 'PII' "${KB_DIR}/data-science-security.md"
}
