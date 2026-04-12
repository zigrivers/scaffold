---
name: research-quant-backtesting
description: Backtesting methodology including walk-forward analysis, look-ahead bias prevention, survivorship bias, transaction cost modeling, and engine architecture
topics: [research, quant-finance, backtesting, walk-forward, look-ahead-bias, survivorship-bias, transaction-costs, validation]
---

Backtesting is the core evaluation mechanism in quantitative finance research. A backtest simulates how a strategy would have performed on historical data, but the gap between a backtest and live trading is enormous. Every design decision in the backtesting engine -- how fills are modeled, whether future data leaks into past decisions, how the instrument universe is constructed, how transaction costs are estimated -- determines whether the results are meaningful or self-deceptive. The primary goal of backtesting infrastructure is not to produce impressive returns but to produce honest results that predict live performance.

## Summary

Build backtesting infrastructure that prevents look-ahead bias through strict temporal ordering, eliminates survivorship bias with point-in-time universes, models realistic transaction costs (commissions, spread, slippage, market impact), and validates results through walk-forward analysis with expanding or rolling windows. Choose between vectorized (fast, simple) and event-driven (realistic, flexible) engine architectures based on strategy complexity. Always validate with multiple out-of-sample periods and statistical significance tests.

## Deep Guidance

### Walk-Forward Analysis

Walk-forward analysis is the gold standard for backtesting validation. It simulates realistic strategy deployment by repeatedly training on a historical window and testing on the subsequent unseen period:

```python
# backtesting/walk_forward.py
from dataclasses import dataclass
from datetime import date, timedelta
import pandas as pd

@dataclass
class WalkForwardConfig:
    """Configuration for walk-forward analysis."""
    train_days: int = 252  # 1 year training window
    test_days: int = 63  # 1 quarter test window
    step_days: int = 63  # Step size (non-overlapping test periods)
    min_train_days: int = 126  # Minimum training data to start
    expanding_window: bool = False  # True = anchored, False = rolling

def generate_walk_forward_splits(
    data: pd.DataFrame,
    config: WalkForwardConfig,
) -> list[tuple[pd.DataFrame, pd.DataFrame]]:
    """Generate train/test splits for walk-forward analysis."""
    dates = data.index.get_level_values("date").unique().sort_values()
    splits = []

    test_start_idx = config.train_days
    while test_start_idx + config.test_days <= len(dates):
        test_end_idx = test_start_idx + config.test_days

        if config.expanding_window:
            train_start_idx = 0
        else:
            train_start_idx = test_start_idx - config.train_days

        train_dates = dates[train_start_idx:test_start_idx]
        test_dates = dates[test_start_idx:test_end_idx]

        train = data.loc[data.index.get_level_values("date").isin(train_dates)]
        test = data.loc[data.index.get_level_values("date").isin(test_dates)]

        splits.append((train, test))
        test_start_idx += config.step_days

    return splits


def run_walk_forward(strategy, data, config: WalkForwardConfig) -> pd.DataFrame:
    """Execute walk-forward analysis and collect per-period results."""
    splits = generate_walk_forward_splits(data, config)
    period_results = []

    for i, (train, test) in enumerate(splits):
        # Fit strategy on training data
        strategy.fit(train)

        # Generate signals on test data (strategy never sees future)
        signals = strategy.generate_signals(test)

        # Simulate trades and compute metrics
        metrics = simulate_trades(signals, test)
        metrics["period"] = i
        metrics["train_start"] = train.index.get_level_values("date").min()
        metrics["test_start"] = test.index.get_level_values("date").min()
        metrics["test_end"] = test.index.get_level_values("date").max()
        period_results.append(metrics)

    return pd.DataFrame(period_results)
```

### Look-Ahead Bias Prevention

Look-ahead bias occurs when information from the future leaks into past trading decisions. It is the single most common cause of backtests that look great but fail in live trading:

```python
# backtesting/temporal_guard.py
import pandas as pd
from functools import wraps

class TemporalGuard:
    """Prevents look-ahead bias by enforcing strict temporal access."""

    def __init__(self, full_data: pd.DataFrame, current_date: pd.Timestamp):
        self._full_data = full_data
        self._current_date = current_date

    @property
    def available_data(self) -> pd.DataFrame:
        """Return only data available at the current simulation date."""
        mask = self._full_data.index.get_level_values("date") <= self._current_date
        return self._full_data.loc[mask].copy()

    def advance_to(self, new_date: pd.Timestamp) -> None:
        """Move the simulation clock forward (never backward)."""
        if new_date < self._current_date:
            raise ValueError(
                f"Cannot move backward: {new_date} < {self._current_date}"
            )
        self._current_date = new_date


# Common look-ahead bias sources and fixes:
#
# 1. Using close price for same-bar entry decisions
#    Fix: Use previous bar's close or current bar's open
#
# 2. Calculating indicators on the full dataset before splitting
#    Fix: Calculate indicators within the walk-forward loop
#
# 3. Using adjusted prices that incorporate future corporate actions
#    Fix: Use point-in-time adjustment factors
#
# 4. Filtering the universe using current index membership
#    Fix: Use point-in-time index membership lists
#
# 5. Using future volatility for position sizing
#    Fix: Use trailing realized volatility only
```

### Survivorship Bias

Survivorship bias occurs when the backtest only includes instruments that still exist today, excluding those that were delisted, went bankrupt, or were acquired:

```python
# backtesting/universe.py
from dataclasses import dataclass
from datetime import date

@dataclass
class PointInTimeUniverse:
    """Construct instrument universes as they existed at each point in time."""
    membership_data: dict[date, list[str]]  # Date -> list of valid tickers

    @classmethod
    def from_index_history(cls, index_changes: list[dict]) -> "PointInTimeUniverse":
        """Build from historical index addition/removal records."""
        members: set[str] = set()
        membership: dict[date, list[str]] = {}

        for change in sorted(index_changes, key=lambda x: x["date"]):
            if change["action"] == "add":
                members.add(change["ticker"])
            elif change["action"] == "remove":
                members.discard(change["ticker"])
            membership[change["date"]] = sorted(members)

        return cls(membership_data=membership)

    def get_universe(self, as_of: date) -> list[str]:
        """Get the instrument universe as it existed on a specific date."""
        valid_dates = [d for d in self.membership_data if d <= as_of]
        if not valid_dates:
            return []
        return self.membership_data[max(valid_dates)]
```

### Transaction Cost Modeling

Realistic transaction costs are the difference between a strategy that looks profitable and one that actually is. Model three components: commissions, spread, and market impact:

```python
# backtesting/costs.py
from dataclasses import dataclass
import numpy as np

@dataclass
class TransactionCostModel:
    """Realistic transaction cost estimation."""
    commission_per_share: float = 0.005  # $0.005 per share (IB-like)
    min_commission: float = 1.00  # Minimum per order
    spread_bps: float = 5.0  # Half-spread in basis points
    market_impact_bps: float = 10.0  # Market impact in basis points
    slippage_pct: float = 0.001  # Additional slippage (0.1%)

    def estimate_cost(
        self,
        price: float,
        shares: int,
        adv: float,  # Average daily volume in shares
    ) -> float:
        """
        Estimate total transaction cost for a single trade.

        Args:
            price: Execution price per share.
            shares: Number of shares traded.
            adv: Average daily volume for market impact estimation.
        """
        notional = price * shares

        # Commission
        commission = max(shares * self.commission_per_share, self.min_commission)

        # Spread cost (half-spread, since we cross the spread)
        spread_cost = notional * (self.spread_bps / 10_000)

        # Market impact (square-root model)
        participation_rate = shares / adv if adv > 0 else 1.0
        impact_cost = notional * (self.market_impact_bps / 10_000) * np.sqrt(
            participation_rate
        )

        # Slippage
        slippage_cost = notional * self.slippage_pct

        return commission + spread_cost + impact_cost + slippage_cost

    def estimate_roundtrip_cost(
        self, price: float, shares: int, adv: float
    ) -> float:
        """Estimate cost for entry + exit."""
        return 2 * self.estimate_cost(price, shares, adv)
```

### Fill Assumptions

Fill assumptions determine how orders are simulated. Unrealistic fill assumptions (e.g., always filling at the limit price) inflate backtest results:

| Assumption | Optimistic (Avoid) | Realistic (Use) |
|-----------|-------------------|-----------------|
| Market orders | Fill at close | Fill at next bar open + slippage |
| Limit orders | Always fill at limit price | Fill only if price trades through limit |
| Stop orders | Fill at exact stop price | Fill at next traded price after trigger |
| Volume capacity | Unlimited fill quantity | Max 5-10% of bar volume |
| Partial fills | Always complete fill | Partial fills proportional to volume |

```python
# backtesting/fill_model.py
from dataclasses import dataclass

@dataclass
class FillModel:
    """Conservative fill assumptions for backtesting."""
    max_volume_participation: float = 0.05  # Max 5% of bar volume
    use_next_bar_open: bool = True  # Execute at next bar open, not current close
    limit_order_fill_through: bool = True  # Require price to trade through limit
    slippage_model: str = "fixed_pct"  # "fixed_pct" or "volume_weighted"

    def simulate_market_fill(self, order_shares: int, bar: dict) -> dict:
        """Simulate a market order fill on the given bar."""
        max_shares = int(bar["volume"] * self.max_volume_participation)
        filled_shares = min(order_shares, max_shares)

        if self.use_next_bar_open:
            fill_price = bar["open"]
        else:
            fill_price = bar["close"]

        return {
            "filled_shares": filled_shares,
            "fill_price": fill_price,
            "unfilled_shares": order_shares - filled_shares,
        }
```

### Vectorized vs Event-Driven Engines

Choose the backtesting engine architecture based on strategy complexity:

| Feature | Vectorized | Event-Driven |
|---------|-----------|-------------|
| Speed | 100-1000x faster | Slower but realistic |
| Complexity | Simple signals only | Arbitrary logic, state |
| Fill modeling | Simplified | Realistic order book |
| Portfolio effects | Approximate | Exact cash/margin tracking |
| Best for | Screening, initial research | Final validation, complex strategies |

```python
# backtesting/vectorized_engine.py
import numpy as np
import pandas as pd

def vectorized_backtest(
    prices: pd.DataFrame,
    signals: pd.Series,
    costs: float = 0.001,
) -> pd.Series:
    """
    Fast vectorized backtest for simple long/short/flat signals.

    Args:
        prices: DataFrame with 'close' column.
        signals: Series of positions (-1, 0, +1).
        costs: Round-trip transaction cost as fraction.

    Returns:
        Equity curve as a Series.
    """
    returns = prices["close"].pct_change()
    strategy_returns = signals.shift(1) * returns  # Shift to avoid look-ahead

    # Deduct transaction costs on position changes
    trades = signals.diff().abs()
    strategy_returns -= trades * costs / 2

    equity = (1 + strategy_returns).cumprod()
    return equity
```

### Validation Checklist

Before accepting any backtest result, verify:

1. **No look-ahead bias**: Indicators computed only on past data, fills at next bar open.
2. **Survivorship-bias-free universe**: Includes delisted, bankrupt, and acquired instruments.
3. **Realistic transaction costs**: Commissions + spread + slippage + market impact.
4. **Conservative fill assumptions**: Volume limits, next-bar execution, partial fills.
5. **Walk-forward validated**: Results from rolling OOS periods, not a single train/test split.
6. **Multiple regimes covered**: OOS periods include both trending and crisis markets.
7. **Statistically significant**: Enough trades for meaningful p-values (minimum 100+).
8. **Benchmarked**: Compared against buy-and-hold, equal-weight, and simple momentum.
