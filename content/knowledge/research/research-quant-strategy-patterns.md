---
name: research-quant-strategy-patterns
description: Trading strategy patterns including signal generation, entry/exit rules, position sizing methods, stop-loss patterns, and multi-asset allocation
topics: [research, quant-finance, strategy, signals, position-sizing, kelly-criterion, stop-loss, allocation, volatility-targeting]
---

Trading strategies are composed of discrete building blocks that can be mixed, matched, and tested independently: signal generation (what to trade and when), entry/exit rules (how to initiate and close positions), position sizing (how much capital to allocate), and stop-loss management (how to limit downside). Treating each block as a separate, testable component enables systematic exploration of the strategy design space. Resist the temptation to build monolithic strategies -- instead, compose simple, well-tested components.

## Summary

Build strategies from composable components: signal generators (trend indicators, mean-reversion z-scores, momentum factors), entry/exit rules (confirmation logic, filter conditions, time-based exits), position sizing methods (fixed fraction, Kelly criterion, volatility targeting), and stop-loss patterns (ATR-based, trailing, time-based). Test each component in isolation before combining. Use a signal-to-position pipeline that separates alpha generation from risk management.

## Deep Guidance

### Signal Generation Patterns

Signals are the core alpha source. They convert market data into directional predictions:

```python
# strategies/signals/base.py
from abc import ABC, abstractmethod
import pandas as pd
import numpy as np

class SignalGenerator(ABC):
    """Base class for signal generators."""

    @abstractmethod
    def generate(self, data: pd.DataFrame) -> pd.Series:
        """
        Generate trading signals from market data.

        Returns:
            Series of signal values. Convention:
            - Positive values = bullish signal (strength)
            - Negative values = bearish signal (strength)
            - Zero = no signal
        """
        ...


class MovingAverageCrossover(SignalGenerator):
    """Dual moving average crossover signal."""

    def __init__(self, fast_period: int = 10, slow_period: int = 50):
        self.fast_period = fast_period
        self.slow_period = slow_period

    def generate(self, data: pd.DataFrame) -> pd.Series:
        fast_ma = data["close"].rolling(self.fast_period).mean()
        slow_ma = data["close"].rolling(self.slow_period).mean()
        # Signal strength = normalized distance between MAs
        signal = (fast_ma - slow_ma) / slow_ma
        return signal


class MeanReversionZScore(SignalGenerator):
    """Z-score based mean reversion signal."""

    def __init__(self, lookback: int = 20, entry_z: float = 2.0):
        self.lookback = lookback
        self.entry_z = entry_z

    def generate(self, data: pd.DataFrame) -> pd.Series:
        rolling_mean = data["close"].rolling(self.lookback).mean()
        rolling_std = data["close"].rolling(self.lookback).std()
        z_score = (data["close"] - rolling_mean) / rolling_std
        # Negative z-score = price below mean = buy signal for mean reversion
        signal = -z_score
        return signal


class MomentumFactor(SignalGenerator):
    """Cross-sectional momentum signal for multi-asset allocation."""

    def __init__(self, lookback: int = 252, skip_recent: int = 21):
        self.lookback = lookback
        self.skip_recent = skip_recent  # Skip most recent month (reversal)

    def generate(self, data: pd.DataFrame) -> pd.Series:
        # Total return over lookback, excluding recent reversal period
        total_return = (
            data["close"].shift(self.skip_recent)
            / data["close"].shift(self.lookback)
            - 1
        )
        return total_return
```

### Entry/Exit Rule Patterns

Entry and exit rules add confirmation, filtering, and timing logic on top of raw signals:

```python
# strategies/rules/entry_exit.py
import pandas as pd
import numpy as np
from dataclasses import dataclass

@dataclass
class TradeSignal:
    """A confirmed trade signal with entry parameters."""
    direction: int  # +1 = long, -1 = short, 0 = no trade
    strength: float  # Signal strength for position sizing
    entry_type: str  # "market", "limit", "stop"
    limit_price: float | None = None
    stop_price: float | None = None

class ConfirmationFilter:
    """Require multiple signals to agree before entering a trade."""

    def __init__(self, signals: list[pd.Series], min_agreement: int = 2):
        self.signals = signals
        self.min_agreement = min_agreement

    def filter(self) -> pd.Series:
        """Return confirmed signals where enough generators agree."""
        # Count how many signals are positive (bullish) at each point
        bullish = sum((s > 0).astype(int) for s in self.signals)
        bearish = sum((s < 0).astype(int) for s in self.signals)

        confirmed = pd.Series(0.0, index=self.signals[0].index)
        confirmed[bullish >= self.min_agreement] = 1.0
        confirmed[bearish >= self.min_agreement] = -1.0
        return confirmed


class VolumeFilter:
    """Require minimum volume before entering a trade."""

    def __init__(self, min_volume_ratio: float = 1.5):
        self.min_volume_ratio = min_volume_ratio

    def apply(self, signal: pd.Series, volume: pd.Series,
              lookback: int = 20) -> pd.Series:
        """Zero out signals on low-volume bars."""
        avg_volume = volume.rolling(lookback).mean()
        volume_ratio = volume / avg_volume
        filtered = signal.copy()
        filtered[volume_ratio < self.min_volume_ratio] = 0.0
        return filtered


class TimeBasedExit:
    """Force exit after a maximum holding period."""

    def __init__(self, max_bars: int = 20):
        self.max_bars = max_bars

    def apply(self, positions: pd.Series) -> pd.Series:
        """Apply time-based exit to existing positions."""
        result = positions.copy()
        bars_in_position = 0

        for i in range(1, len(result)):
            if result.iloc[i] != 0:
                bars_in_position += 1
                if bars_in_position >= self.max_bars:
                    result.iloc[i] = 0
                    bars_in_position = 0
            else:
                bars_in_position = 0

        return result
```

### Position Sizing Methods

Position sizing is arguably more important than signal generation. It determines how much capital to risk on each trade:

```python
# strategies/sizing/position_sizing.py
import numpy as np
import pandas as pd
from abc import ABC, abstractmethod

class PositionSizer(ABC):
    """Base class for position sizing methods."""

    @abstractmethod
    def size(self, signal_strength: float, price: float,
             portfolio_value: float, **kwargs) -> int:
        """Return number of shares to trade."""
        ...


class FixedFraction(PositionSizer):
    """Risk a fixed fraction of portfolio per trade."""

    def __init__(self, risk_pct: float = 0.02, atr_multiplier: float = 2.0):
        self.risk_pct = risk_pct
        self.atr_multiplier = atr_multiplier

    def size(self, signal_strength: float, price: float,
             portfolio_value: float, atr: float = 0.0, **kwargs) -> int:
        """
        Size based on fixed-fraction risk.

        risk_amount = portfolio * risk_pct
        stop_distance = atr * atr_multiplier
        shares = risk_amount / stop_distance
        """
        risk_amount = portfolio_value * self.risk_pct
        stop_distance = atr * self.atr_multiplier if atr > 0 else price * 0.02
        if stop_distance == 0:
            return 0
        shares = int(risk_amount / stop_distance)
        return shares


class KellyCriterion(PositionSizer):
    """Kelly criterion position sizing with fractional Kelly for safety."""

    def __init__(self, kelly_fraction: float = 0.25, max_position_pct: float = 0.10):
        self.kelly_fraction = kelly_fraction  # Use quarter-Kelly for safety
        self.max_position_pct = max_position_pct

    def size(self, signal_strength: float, price: float,
             portfolio_value: float, win_rate: float = 0.5,
             avg_win_loss_ratio: float = 1.5, **kwargs) -> int:
        """
        Kelly criterion: f* = (bp - q) / b
        where b = avg_win/avg_loss, p = win_rate, q = 1 - p
        """
        b = avg_win_loss_ratio
        p = win_rate
        q = 1 - p
        kelly_pct = (b * p - q) / b if b > 0 else 0.0

        # Apply fractional Kelly and cap
        position_pct = min(
            kelly_pct * self.kelly_fraction,
            self.max_position_pct,
        )
        position_pct = max(position_pct, 0.0)  # Never negative

        notional = portfolio_value * position_pct
        shares = int(notional / price) if price > 0 else 0
        return shares


class VolatilityTargeting(PositionSizer):
    """Size positions to target a specific portfolio volatility."""

    def __init__(self, target_vol: float = 0.15, lookback: int = 20):
        self.target_vol = target_vol  # 15% annualized target
        self.lookback = lookback

    def size(self, signal_strength: float, price: float,
             portfolio_value: float, returns: pd.Series | None = None,
             **kwargs) -> int:
        """
        Scale position to achieve target volatility contribution.

        position_weight = target_vol / (asset_vol * sqrt(252))
        """
        if returns is None or len(returns) < self.lookback:
            return 0

        asset_vol = returns.tail(self.lookback).std() * np.sqrt(252)
        if asset_vol == 0:
            return 0

        weight = self.target_vol / asset_vol
        weight = min(weight, 2.0)  # Cap at 2x leverage per asset
        notional = portfolio_value * weight * abs(signal_strength)
        shares = int(notional / price) if price > 0 else 0
        return shares
```

### Stop-Loss Patterns

Stop-losses protect against large losses. The stop type should match the strategy timeframe and volatility:

```python
# strategies/risk/stop_loss.py
import pandas as pd
import numpy as np

class ATRStop:
    """ATR-based stop-loss that adapts to volatility."""

    def __init__(self, atr_period: int = 14, atr_multiplier: float = 2.0):
        self.atr_period = atr_period
        self.atr_multiplier = atr_multiplier

    def compute_stops(self, data: pd.DataFrame, direction: int) -> pd.Series:
        """Compute stop-loss levels based on ATR."""
        atr = self._compute_atr(data)
        if direction == 1:  # Long: stop below entry
            stops = data["close"] - atr * self.atr_multiplier
        else:  # Short: stop above entry
            stops = data["close"] + atr * self.atr_multiplier
        return stops

    def _compute_atr(self, data: pd.DataFrame) -> pd.Series:
        high_low = data["high"] - data["low"]
        high_close = (data["high"] - data["close"].shift(1)).abs()
        low_close = (data["low"] - data["close"].shift(1)).abs()
        true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        return true_range.rolling(self.atr_period).mean()


class TrailingStop:
    """Trailing stop that locks in profits as price moves favorably."""

    def __init__(self, trail_pct: float = 0.05):
        self.trail_pct = trail_pct

    def track(self, prices: pd.Series, direction: int) -> pd.Series:
        """Track trailing stop level through a position."""
        stops = pd.Series(index=prices.index, dtype=float)

        if direction == 1:  # Long
            peak = prices.iloc[0]
            for i, price in enumerate(prices):
                peak = max(peak, price)
                stops.iloc[i] = peak * (1 - self.trail_pct)
        else:  # Short
            trough = prices.iloc[0]
            for i, price in enumerate(prices):
                trough = min(trough, price)
                stops.iloc[i] = trough * (1 + self.trail_pct)

        return stops


class TimeStop:
    """Exit after a maximum holding period regardless of P&L."""

    def __init__(self, max_bars: int = 20):
        self.max_bars = max_bars

    def should_exit(self, bars_held: int) -> bool:
        return bars_held >= self.max_bars
```

### Multi-Asset Allocation

When trading multiple instruments, allocation determines the portfolio weights across assets:

```python
# strategies/allocation/multi_asset.py
import numpy as np
import pandas as pd

def equal_weight(signals: dict[str, float]) -> dict[str, float]:
    """Equal weight across all assets with active signals."""
    active = {k: v for k, v in signals.items() if v != 0}
    if not active:
        return {k: 0.0 for k in signals}
    weight = 1.0 / len(active)
    return {k: weight * np.sign(v) if v != 0 else 0.0 for k, v in signals.items()}


def signal_weighted(signals: dict[str, float]) -> dict[str, float]:
    """Weight proportional to signal strength."""
    total = sum(abs(v) for v in signals.values())
    if total == 0:
        return {k: 0.0 for k in signals}
    return {k: v / total for k, v in signals.items()}


def inverse_volatility(
    returns: pd.DataFrame,
    lookback: int = 60,
) -> dict[str, float]:
    """Allocate inversely proportional to recent volatility."""
    recent = returns.tail(lookback)
    vols = recent.std() * np.sqrt(252)
    inv_vol = 1.0 / vols.replace(0, np.inf)
    weights = inv_vol / inv_vol.sum()
    return weights.to_dict()


def risk_parity(
    returns: pd.DataFrame,
    lookback: int = 60,
    target_vol: float = 0.10,
) -> dict[str, float]:
    """
    Risk parity — equal risk contribution from each asset.

    Each asset contributes equally to portfolio volatility.
    """
    recent = returns.tail(lookback)
    cov = recent.cov() * 252
    n = len(cov)

    # Simple approximation: inverse vol with correlation adjustment
    vols = np.sqrt(np.diag(cov))
    inv_vol = 1.0 / vols
    weights = inv_vol / inv_vol.sum()

    # Scale to target volatility
    port_vol = np.sqrt(weights @ cov.values @ weights)
    if port_vol > 0:
        weights *= target_vol / port_vol

    return dict(zip(returns.columns, weights))
```

### Strategy Composition Pattern

Compose strategies from independent, tested components using a pipeline:

```
Signal Generators → Confirmation Filter → Position Sizer → Stop Manager → Allocation
     (alpha)          (noise reduction)      (risk mgmt)    (protection)   (portfolio)
```

Each component is tested in isolation before the pipeline is assembled. This enables systematic A/B testing of individual components (e.g., "does adding a volume filter improve the momentum signal?") without rebuilding the entire strategy.
