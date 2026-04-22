---
name: data-science-testing
description: Testing strategy for solo DS code — pytest for pure functions, pandera for DataFrame schemas at test time and at ingest boundaries, and committed CSV fixtures for deterministic tests
topics: [data-science, testing, pytest, pandera]
---

Data-science code rots quietly. A notebook cell that worked on Tuesday's snapshot silently breaks on Friday's because an upstream column was renamed, a dtype shifted from `int64` to `float64`, or a categorical grew a new level nobody tested for. Refactors that move feature logic out of a notebook into `src/` routinely regress because there was no test pinning the old behavior. Tests catch these failures at the line that introduced them instead of at the end of a three-hour pipeline run.

## Summary

Treat DS testing as three separate layers with distinct tools. Use `pytest` for pure-function unit tests — feature engineering, metric calculations, preprocessing helpers in `src/`. Use `pandera` for DataFrame-level contracts: schemas assert column names, dtypes, value ranges, and non-null expectations, and those same schemas run both in tests and at runtime at ingest boundaries. Use committed CSV fixtures in `tests/fixtures/` loaded through pytest fixtures for deterministic, reviewable test data. Keep this doc's scope to CODE correctness; model quality (AUC, calibration, drift) belongs in `data-science-model-evaluation.md`.

## Deep Guidance

### Unit tests with pytest

Every helper in `src/` that transforms data is a pure function candidate for `pytest`. Arrange small inputs, act by calling the function, assert on the output. If a helper reaches for a database or filesystem, push that I/O out to the caller so the core logic stays testable without mocks.

```python
# tests/test_features.py
import numpy as np
import pandas as pd
import pytest
from src.features import impute_missing_ages

class TestImputeMissingAges:
    def test_fills_nan_with_median(self):
        df = pd.DataFrame({"age": [10.0, 20.0, 30.0, np.nan]})
        result = impute_missing_ages(df)
        assert result["age"].isna().sum() == 0
        assert result.loc[3, "age"] == 20.0  # median of [10, 20, 30]

    def test_preserves_non_null_values(self):
        df = pd.DataFrame({"age": [10.0, 20.0, 30.0, np.nan]})
        result = impute_missing_ages(df)
        pd.testing.assert_series_equal(
            result.loc[:2, "age"], df.loc[:2, "age"], check_names=False
        )

    def test_all_nan_raises(self):
        df = pd.DataFrame({"age": [np.nan, np.nan]})
        with pytest.raises(ValueError, match="all-null"):
            impute_missing_ages(df)
```

Run with `pytest -q`. Add `--cov=src` via `pytest-cov` once the project has more than a handful of helpers; aim for coverage on feature-engineering and metrics modules, not notebooks.

Four rules keep this layer productive:

- **Name tests after the behavior, not the function**: `test_fills_nan_with_median` beats `test_impute_missing_ages_1`. The name is the failure message when CI turns red.
- **One assertion family per test**: a test checks either output values, or output shape, or error behavior — not all three. Split into three tests. Failures point at the broken property immediately.
- **Use `pd.testing.assert_frame_equal` and `np.testing.assert_allclose`**: never compare DataFrames with `==` or floats with exact equality. Pass `rtol`/`atol` explicitly so the tolerance is visible in the test.
- **Mark slow tests**: decorate any test that loads a non-trivial dataset with `@pytest.mark.slow` and run the default suite with `-m "not slow"` so `pytest` stays under ~5 seconds on save.

### Data-frame validation with pandera

Column drift is the single most common source of silent DS bugs. `pandera` encodes a DataFrame contract once and reuses it as a test assertion and a runtime guard at ingest boundaries — the moment a CSV, parquet file, or API response becomes a DataFrame.

```python
# src/schemas.py
import pandera.pandas as pa
from pandera.typing import Series

class CustomersSchema(pa.DataFrameModel):
    customer_id: Series[int] = pa.Field(unique=True, ge=0)
    age: Series[float] = pa.Field(ge=0, le=120, nullable=True)
    signup_date: Series[pa.DateTime]
    segment: Series[str] = pa.Field(isin=["free", "pro", "enterprise"])

    class Config:
        strict = True  # reject unexpected columns

# src/ingest.py — runtime validation at the boundary
from src.schemas import CustomersSchema

def load_customers(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["signup_date"])
    return CustomersSchema.validate(df)  # raises SchemaError on violation
```

The same schema doubles as a test fixture contract:

```python
# tests/test_ingest.py
import pandas as pd
import pytest
from pandera.errors import SchemaError
from src.ingest import load_customers

def test_rejects_invalid_segment(tmp_path):
    bad = tmp_path / "bad.csv"
    bad.write_text("customer_id,age,signup_date,segment\n1,30,2024-01-01,vip\n")
    with pytest.raises(SchemaError, match="segment"):
        load_customers(str(bad))
```

Prefer `schema.validate(df)` calls over the `@pa.check_input` decorator — explicit validation is easier to trace in stack traces and does not hide behind import-time decoration.

Three patterns make pandera pay off:

- **Validate once at the boundary, trust downstream**: call `Schema.validate(df)` inside `load_customers`, `load_orders`, or whatever function first produces a DataFrame. Downstream code can then assume columns, dtypes, and ranges without re-checking.
- **Use `lazy=True` during development**: `Schema.validate(df, lazy=True)` collects every violation instead of failing on the first, which is dramatically faster when fixing a bad CSV.
- **Version schemas alongside migrations**: when a column renames or a new category lands, update the schema in the same PR as the code change. Schema drift caught in code review is cheaper than schema drift caught in production.

### Fixtures: deterministic test data

Random DataFrames in tests produce flaky failures that are painful to debug. Commit small, hand-curated CSVs to `tests/fixtures/` and load them through pytest `fixture` functions. The CSVs are reviewable in PRs, the fixtures are reusable across test modules.

```python
# tests/conftest.py
from pathlib import Path
import pandas as pd
import pytest

FIXTURES = Path(__file__).parent / "fixtures"

@pytest.fixture
def customers_df() -> pd.DataFrame:
    return pd.read_csv(FIXTURES / "customers_small.csv", parse_dates=["signup_date"])

@pytest.fixture(params=["customers_empty.csv", "customers_one_row.csv", "customers_small.csv"])
def customers_edge_cases(request) -> pd.DataFrame:
    return pd.read_csv(FIXTURES / request.param, parse_dates=["signup_date"])
```

Use `@pytest.mark.parametrize` to cover multiple scenarios without duplicating test bodies:

```python
@pytest.mark.parametrize(
    "segment,expected_discount",
    [("free", 0.0), ("pro", 0.1), ("enterprise", 0.2)],
)
def test_discount_by_segment(segment, expected_discount):
    assert compute_discount(segment) == expected_discount
```

Keep fixture CSVs under ~50 rows. Anything larger belongs in a `data/` directory and should be generated or downloaded, not committed.

When a test genuinely needs a larger or procedurally generated DataFrame, build it deterministically with a seeded RNG inside a fixture — never inline, and never with the global `np.random` state:

```python
@pytest.fixture
def synthetic_transactions() -> pd.DataFrame:
    rng = np.random.default_rng(seed=42)
    n = 1000
    return pd.DataFrame({
        "user_id": rng.integers(0, 100, size=n),
        "amount": rng.lognormal(mean=3.0, sigma=1.0, size=n),
        "ts": pd.date_range("2024-01-01", periods=n, freq="1h"),
    })
```

A fixed seed means the same test always sees the same data, so flaky-failure postmortems are possible instead of "must have been a weird random sample."

### Running the suite

Layout and commands stay boring on purpose:

```
tests/
  conftest.py          # shared fixtures
  fixtures/            # small committed CSVs
    customers_small.csv
    customers_empty.csv
  test_features.py     # pytest for src/features.py
  test_ingest.py       # pandera + ingest tests
  test_metrics.py      # pytest for src/metrics.py
```

Wire `pytest` into `pyproject.toml` so `pytest` alone runs the right suite:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q --strict-markers -m 'not slow'"
markers = ["slow: tests that load non-trivial data"]
```

Run the fast suite on every save (a file-watcher like `pytest-watch` helps), and run `pytest -m slow` or `pytest` with no marker filter before each commit. In CI, run the full suite unconditionally.

### What NOT to test

Don't unit-test `pandas`, `numpy`, or `pandera` themselves — assume upstream libraries work and pin versions in `pyproject.toml` to catch surprises via dependency bumps, not your own test suite. Don't assert on model quality metrics here (AUC, precision, calibration); those live in `data-science-model-evaluation.md` and run on held-out data, not fixtures. Don't write tests that require a live database, S3 bucket, or trained model file — those belong in integration tests run out-of-band, not the fast `pytest` suite a developer runs on save. And don't test notebooks directly; if a notebook cell has logic worth testing, extract it to `src/` first, then test the function.
