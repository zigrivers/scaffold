---
name: research-quant-market-data
description: Market data sourcing including OHLCV providers, tick data, corporate actions handling, data quality checks, gap handling, and timezone normalization
topics: [research, quant-finance, market-data, ohlcv, tick-data, corporate-actions, data-quality, alternative-data]
---

Market data is the foundation of every quantitative strategy. Bad data produces bad backtests, and bad backtests produce strategies that fail in production. The data pipeline must handle multiple source providers with different conventions, normalize timestamps across timezones, adjust prices for corporate actions (splits, dividends, mergers), detect and fill gaps, and validate quality before any data reaches the strategy. Data quality issues are the most common source of phantom alpha -- apparent returns that disappear when data errors are fixed.

## Summary

Build a data pipeline that sources OHLCV data from multiple providers (Yahoo Finance for screening, Polygon/Alpha Vantage for research-grade data), handles corporate actions correctly (use fully adjusted prices or apply point-in-time adjustment factors), validates quality (gap detection, outlier filtering, volume anomalies), normalizes timezones to a single reference (UTC or exchange local time), and stores data in a local cache to avoid repeated API calls. For tick data, use dedicated providers (Polygon, TickData) and downsample to desired frequency with proper bar construction.

## Deep Guidance

### Data Source Hierarchy

Use different data sources for different stages of research. Free sources are fine for initial screening; paid sources are necessary for final validation:

| Provider | Cost | Quality | Frequency | Best For |
|----------|------|---------|-----------|----------|
| Yahoo Finance (yfinance) | Free | Medium | Daily | Initial screening, idea generation |
| Alpha Vantage | Free tier + paid | Medium-High | 1min - Daily | Intraday research, small universes |
| Polygon.io | $29-199/mo | High | Tick - Daily | Production research, large universes |
| Tiingo | $10-30/mo | High | Daily + IEX tick | EOD research, news data |
| Quandl/Nasdaq Data Link | Varies | High | Daily | Fundamentals, alternative data |
| Interactive Brokers | Trading account | High | Tick - Daily | Live data, historical backfill |

```python
# data/providers/base.py
from abc import ABC, abstractmethod
from datetime import date
import pandas as pd

class DataProvider(ABC):
    """Base interface for market data providers."""

    @abstractmethod
    def fetch_ohlcv(
        self,
        symbol: str,
        start: date,
        end: date,
        frequency: str = "1D",
    ) -> pd.DataFrame:
        """
        Fetch OHLCV data for a single symbol.

        Returns DataFrame with columns: open, high, low, close, volume
        Index: DatetimeIndex (timezone-aware UTC)
        """
        ...

    @abstractmethod
    def fetch_splits(self, symbol: str, start: date, end: date) -> list[dict]:
        """Fetch stock split history."""
        ...

    @abstractmethod
    def fetch_dividends(self, symbol: str, start: date, end: date) -> list[dict]:
        """Fetch dividend history."""
        ...
```

### Corporate Actions Handling

Corporate actions (splits, dividends, mergers, spinoffs) change the price series in ways that must be accounted for to avoid phantom signals:

```python
# data/adjustments.py
import pandas as pd
import numpy as np

def adjust_for_splits(
    prices: pd.DataFrame,
    splits: list[dict],
) -> pd.DataFrame:
    """
    Apply split adjustments to historical prices.

    Adjusts prices backward from most recent split to preserve
    current price levels. This is the standard convention.
    """
    adjusted = prices.copy()

    # Sort splits in reverse chronological order
    for split in sorted(splits, key=lambda s: s["date"], reverse=True):
        split_date = pd.Timestamp(split["date"])
        ratio = split["ratio"]  # e.g., 4.0 for a 4:1 split

        mask = adjusted.index < split_date
        for col in ["open", "high", "low", "close"]:
            adjusted.loc[mask, col] /= ratio
        adjusted.loc[mask, "volume"] *= ratio

    return adjusted


def adjust_for_dividends(
    prices: pd.DataFrame,
    dividends: list[dict],
    method: str = "proportional",
) -> pd.DataFrame:
    """
    Apply dividend adjustments to historical prices.

    Args:
        method: "proportional" (standard) or "subtractive" (simple).
    """
    adjusted = prices.copy()

    for div in sorted(dividends, key=lambda d: d["ex_date"], reverse=True):
        ex_date = pd.Timestamp(div["ex_date"])
        amount = div["amount"]

        mask = adjusted.index < ex_date
        if method == "proportional":
            # Standard: adjust by the ratio (close - dividend) / close
            close_before = adjusted.loc[mask, "close"].iloc[-1] if mask.any() else 0
            if close_before > 0:
                factor = (close_before - amount) / close_before
                for col in ["open", "high", "low", "close"]:
                    adjusted.loc[mask, col] *= factor
        elif method == "subtractive":
            for col in ["open", "high", "low", "close"]:
                adjusted.loc[mask, col] -= amount

    return adjusted
```

### Data Quality Checks

Run quality checks on every dataset before it enters the backtest. Catch problems early rather than debugging phantom strategy behavior:

```python
# data/quality.py
import pandas as pd
import numpy as np
from dataclasses import dataclass, field

@dataclass
class QualityReport:
    """Results of data quality validation."""
    symbol: str
    total_bars: int
    issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return len(self.issues) == 0

def validate_ohlcv(df: pd.DataFrame, symbol: str) -> QualityReport:
    """Comprehensive OHLCV data quality validation."""
    report = QualityReport(symbol=symbol, total_bars=len(df))

    # Check required columns
    required = ["open", "high", "low", "close", "volume"]
    for col in required:
        if col not in df.columns:
            report.issues.append(f"Missing column: {col}")
    if report.issues:
        return report

    # OHLC consistency: high >= open, close, low; low <= open, close, high
    bad_high = df[df["high"] < df[["open", "close"]].max(axis=1)]
    if len(bad_high) > 0:
        report.issues.append(f"{len(bad_high)} bars where high < max(open, close)")

    bad_low = df[df["low"] > df[["open", "close"]].min(axis=1)]
    if len(bad_low) > 0:
        report.issues.append(f"{len(bad_low)} bars where low > min(open, close)")

    # Zero or negative prices
    for col in ["open", "high", "low", "close"]:
        zeros = (df[col] <= 0).sum()
        if zeros > 0:
            report.issues.append(f"{zeros} bars with {col} <= 0")

    # Null values
    null_pct = df[required].isnull().sum().sum() / (len(df) * len(required)) * 100
    if null_pct > 0:
        report.warnings.append(f"Null values: {null_pct:.2f}%")
    if null_pct > 1:
        report.issues.append(f"Null values exceed 1%: {null_pct:.2f}%")

    # Extreme returns (potential data errors)
    returns = df["close"].pct_change().dropna()
    extreme = returns[returns.abs() > 0.5]  # >50% daily move
    if len(extreme) > 0:
        report.warnings.append(
            f"{len(extreme)} extreme daily returns (>50%): check for split errors"
        )

    # Volume anomalies
    zero_vol = (df["volume"] == 0).sum()
    if zero_vol > len(df) * 0.05:
        report.warnings.append(f"{zero_vol} zero-volume bars ({zero_vol/len(df)*100:.1f}%)")

    # Duplicate timestamps
    dupes = df.index.duplicated().sum()
    if dupes > 0:
        report.issues.append(f"{dupes} duplicate timestamps")

    return report
```

### Gap Handling

Missing data bars occur due to holidays, trading halts, data provider issues, or illiquid instruments. Handle gaps explicitly:

```python
# data/gap_handling.py
import pandas as pd

def detect_gaps(
    df: pd.DataFrame,
    frequency: str = "1D",
    max_gap_periods: int = 5,
) -> list[dict]:
    """Detect data gaps exceeding the maximum allowed threshold."""
    expected_freq = pd.tseries.frequencies.to_offset(frequency)
    gaps = []

    for i in range(1, len(df)):
        delta = df.index[i] - df.index[i - 1]
        expected_delta = expected_freq * 1

        # For daily data, skip weekends (2-day gaps are normal)
        if frequency == "1D" and delta.days <= 3:
            continue

        gap_periods = delta / expected_delta
        if gap_periods > max_gap_periods:
            gaps.append({
                "start": df.index[i - 1],
                "end": df.index[i],
                "gap_periods": int(gap_periods),
            })

    return gaps


def fill_gaps(
    df: pd.DataFrame,
    method: str = "ffill",
    max_fill: int = 5,
) -> pd.DataFrame:
    """
    Fill data gaps using specified method.

    Args:
        method: "ffill" (forward fill), "interpolate", or "drop".
        max_fill: Maximum consecutive bars to fill.
    """
    if method == "ffill":
        return df.ffill(limit=max_fill)
    elif method == "interpolate":
        return df.interpolate(method="time", limit=max_fill)
    elif method == "drop":
        return df.dropna()
    else:
        raise ValueError(f"Unknown fill method: {method}")
```

### Timezone Normalization

All timestamps must be normalized to a single reference timezone before any analysis. Mixed timezones cause subtle alignment bugs:

```python
# data/timezone.py
import pandas as pd

# Exchange timezone mapping
EXCHANGE_TIMEZONES = {
    "NYSE": "America/New_York",
    "NASDAQ": "America/New_York",
    "LSE": "Europe/London",
    "TSE": "Asia/Tokyo",
    "HKEX": "Asia/Hong_Kong",
    "ASX": "Australia/Sydney",
}

def normalize_to_utc(
    df: pd.DataFrame,
    source_tz: str,
) -> pd.DataFrame:
    """
    Normalize timestamps to UTC.

    If timestamps are timezone-naive, localize to source_tz first.
    """
    if df.index.tz is None:
        df.index = df.index.tz_localize(source_tz)
    return df.tz_convert("UTC")


def align_multi_exchange(
    datasets: dict[str, pd.DataFrame],
    reference_tz: str = "UTC",
) -> dict[str, pd.DataFrame]:
    """Align datasets from multiple exchanges to a common timezone."""
    aligned = {}
    for symbol, df in datasets.items():
        if df.index.tz is None:
            raise ValueError(f"{symbol}: timestamps must be timezone-aware")
        aligned[symbol] = df.tz_convert(reference_tz)
    return aligned
```

### Local Data Cache

Cache data locally to avoid repeated API calls and ensure reproducibility:

```python
# data/cache.py
import hashlib
import json
from pathlib import Path
from datetime import date
import pandas as pd

class DataCache:
    """File-based cache for market data with invalidation."""

    def __init__(self, cache_dir: str = "data/cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_key(self, symbol: str, start: date, end: date, freq: str) -> str:
        raw = f"{symbol}_{start}_{end}_{freq}"
        return hashlib.md5(raw.encode()).hexdigest()

    def get(self, symbol: str, start: date, end: date, freq: str) -> pd.DataFrame | None:
        key = self._cache_key(symbol, start, end, freq)
        path = self.cache_dir / f"{key}.parquet"
        if path.exists():
            return pd.read_parquet(path)
        return None

    def put(self, symbol: str, start: date, end: date, freq: str,
            data: pd.DataFrame) -> None:
        key = self._cache_key(symbol, start, end, freq)
        path = self.cache_dir / f"{key}.parquet"
        data.to_parquet(path)

    def invalidate(self, symbol: str, start: date, end: date, freq: str) -> None:
        key = self._cache_key(symbol, start, end, freq)
        path = self.cache_dir / f"{key}.parquet"
        if path.exists():
            path.unlink()
```

### Alternative Data Sources

Beyond price and volume, alternative data can provide unique signals:

| Data Type | Sources | Use Case |
|-----------|---------|----------|
| Sentiment | News APIs, social media | Contrarian/momentum signals |
| Fundamentals | SEC EDGAR, Quandl | Value-based strategies |
| Options flow | CBOE, OCC | Implied volatility signals |
| Insider trading | SEC Form 4 | Informed trading signals |
| Short interest | FINRA, exchanges | Crowding/squeeze signals |
| Macro indicators | FRED, World Bank | Regime detection |

Always validate alternative data for coverage, timeliness, and look-ahead bias before incorporating it into a strategy.
