---
name: research-quant-risk
description: Risk management for trading research including regime detection, tail risk measures, correlation breakdown, position limits, drawdown controls, and kill switches
topics: [research, quant-finance, risk, regime-detection, tail-risk, var, cvar, correlation, drawdown-controls, kill-switch]
---

Risk management in quantitative finance is not an afterthought bolted onto a profitable strategy -- it is the primary constraint that determines whether a strategy survives long enough to realize its edge. Markets exhibit non-stationary behavior: correlations spike during crises, volatility clusters in ways that violate normal distribution assumptions, and tail events occur far more frequently than Gaussian models predict. A strategy without regime awareness, tail risk measurement, position limits, and automated kill switches is not a strategy -- it is a gamble.

## Summary

Implement risk management as a layered system: regime detection (HMM, volatility clustering) determines the current market state and gates strategy behavior; tail risk measures (VaR, CVaR, stress testing) quantify worst-case scenarios beyond what standard deviation captures; position limits (max position size, sector exposure, concentration) prevent over-commitment; drawdown controls (max drawdown threshold, recovery rules) cap cumulative losses; and kill switches (automated circuit breakers) halt all trading when conditions exceed safe operating parameters. Every layer operates independently -- if one fails, the others still protect capital.

## Deep Guidance

### Regime Detection

Market regimes (trending, mean-reverting, high-volatility, crisis) fundamentally change strategy performance. Detect regimes to gate strategy behavior:

```python
# risk/regime_detection.py
import numpy as np
import pandas as pd
from dataclasses import dataclass
from enum import Enum

class Regime(Enum):
    LOW_VOL = "low_volatility"
    NORMAL = "normal"
    HIGH_VOL = "high_volatility"
    CRISIS = "crisis"

@dataclass
class RegimeState:
    """Current regime classification with confidence."""
    regime: Regime
    confidence: float  # 0-1
    volatility: float  # Current annualized volatility
    vol_percentile: float  # Percentile vs. history

class VolatilityRegimeDetector:
    """
    Simple volatility-based regime detector.

    Uses realized volatility percentiles relative to history.
    More robust than HMM for live deployment (no fitting required).
    """

    def __init__(
        self,
        lookback: int = 20,
        history_window: int = 252 * 5,
        crisis_percentile: float = 95,
        high_vol_percentile: float = 75,
        low_vol_percentile: float = 25,
    ):
        self.lookback = lookback
        self.history_window = history_window
        self.crisis_pct = crisis_percentile
        self.high_vol_pct = high_vol_percentile
        self.low_vol_pct = low_vol_percentile

    def detect(self, returns: pd.Series) -> RegimeState:
        """Classify current regime from return history."""
        recent_vol = returns.tail(self.lookback).std() * np.sqrt(252)
        historical_vols = (
            returns.rolling(self.lookback).std() * np.sqrt(252)
        ).dropna().tail(self.history_window)

        percentile = (historical_vols < recent_vol).mean() * 100

        if percentile >= self.crisis_pct:
            regime = Regime.CRISIS
            confidence = min((percentile - self.crisis_pct) / 5 + 0.8, 1.0)
        elif percentile >= self.high_vol_pct:
            regime = Regime.HIGH_VOL
            confidence = 0.7
        elif percentile <= self.low_vol_pct:
            regime = Regime.LOW_VOL
            confidence = 0.7
        else:
            regime = Regime.NORMAL
            confidence = 0.8

        return RegimeState(
            regime=regime,
            confidence=confidence,
            volatility=recent_vol,
            vol_percentile=percentile,
        )


class HMMRegimeDetector:
    """
    Hidden Markov Model regime detector.

    Fits a 2-3 state HMM to return series. Better for research
    (offline analysis) than live trading (requires refitting).
    """

    def __init__(self, n_states: int = 3, lookback: int = 252 * 3):
        self.n_states = n_states
        self.lookback = lookback
        self.model = None

    def fit(self, returns: pd.Series) -> None:
        """Fit HMM to historical returns."""
        try:
            from hmmlearn.hmm import GaussianHMM
        except ImportError:
            raise ImportError("pip install hmmlearn for HMM regime detection")

        data = returns.tail(self.lookback).values.reshape(-1, 1)
        self.model = GaussianHMM(
            n_components=self.n_states,
            covariance_type="full",
            n_iter=100,
            random_state=42,
        )
        self.model.fit(data)

    def predict(self, returns: pd.Series) -> np.ndarray:
        """Predict regime states for each time step."""
        if self.model is None:
            raise RuntimeError("Call fit() before predict()")
        data = returns.values.reshape(-1, 1)
        return self.model.predict(data)
```

### Tail Risk Measures

Standard deviation understates risk because market returns have fat tails. Use VaR and CVaR for tail risk:

```python
# risk/tail_risk.py
import numpy as np
import pandas as pd

def value_at_risk(
    returns: pd.Series,
    confidence: float = 0.95,
    method: str = "historical",
    lookback: int = 252,
) -> float:
    """
    Value at Risk — maximum expected loss at a given confidence level.

    Args:
        confidence: Confidence level (e.g., 0.95 = 95%).
        method: "historical" (percentile) or "parametric" (Gaussian).
        lookback: Number of observations to use.

    Returns:
        VaR as a negative number (loss).
    """
    data = returns.tail(lookback).dropna()

    if method == "historical":
        return float(np.percentile(data, (1 - confidence) * 100))
    elif method == "parametric":
        from scipy.stats import norm
        z = norm.ppf(1 - confidence)
        return float(data.mean() + z * data.std())
    else:
        raise ValueError(f"Unknown VaR method: {method}")


def conditional_var(
    returns: pd.Series,
    confidence: float = 0.95,
    lookback: int = 252,
) -> float:
    """
    Conditional VaR (Expected Shortfall) — average loss beyond VaR.

    CVaR answers: "When we do lose more than VaR, how bad is it on average?"
    Always worse than VaR, captures tail severity.
    """
    data = returns.tail(lookback).dropna()
    var = value_at_risk(data, confidence, method="historical", lookback=lookback)
    tail_losses = data[data <= var]
    return float(tail_losses.mean()) if len(tail_losses) > 0 else var


def stress_test(
    portfolio_returns: pd.Series,
    scenarios: dict[str, tuple[str, str]],
    market_data: pd.DataFrame,
) -> dict[str, dict]:
    """
    Stress test portfolio against historical crisis scenarios.

    Args:
        scenarios: Dict of scenario_name -> (start_date, end_date).
    """
    results = {}
    for name, (start, end) in scenarios.items():
        mask = (portfolio_returns.index >= start) & (portfolio_returns.index <= end)
        scenario_returns = portfolio_returns[mask]

        if len(scenario_returns) == 0:
            continue

        results[name] = {
            "total_return": float((1 + scenario_returns).prod() - 1),
            "max_drawdown": float(_max_dd(scenario_returns)),
            "worst_day": float(scenario_returns.min()),
            "volatility": float(scenario_returns.std() * np.sqrt(252)),
            "days": len(scenario_returns),
        }

    return results

def _max_dd(returns: pd.Series) -> float:
    equity = (1 + returns).cumprod()
    return float((equity / equity.cummax() - 1).min())

# Standard stress test scenarios
CRISIS_SCENARIOS = {
    "gfc_2008": ("2008-09-01", "2009-03-31"),
    "covid_2020": ("2020-02-19", "2020-03-23"),
    "dot_com_2000": ("2000-03-10", "2002-10-09"),
    "flash_crash_2010": ("2010-05-06", "2010-05-06"),
    "vol_shock_2018": ("2018-02-01", "2018-02-09"),
    "rate_hike_2022": ("2022-01-03", "2022-10-12"),
}
```

### Correlation Breakdown

During crises, asset correlations spike toward 1.0, destroying diversification benefits exactly when they are most needed:

```python
# risk/correlation.py
import numpy as np
import pandas as pd

def rolling_correlation_matrix(
    returns: pd.DataFrame,
    window: int = 60,
) -> pd.DataFrame:
    """Compute rolling correlation matrix (returns latest window)."""
    return returns.tail(window).corr()


def detect_correlation_spike(
    returns: pd.DataFrame,
    window: int = 20,
    history_window: int = 252,
    threshold_percentile: float = 90,
) -> dict:
    """
    Detect when average pairwise correlation exceeds historical norms.

    Returns:
        Dict with current_avg_corr, historical_percentile, is_spike.
    """
    # Current average pairwise correlation
    current_corr = returns.tail(window).corr()
    mask = np.triu(np.ones_like(current_corr, dtype=bool), k=1)
    current_avg = float(current_corr.values[mask].mean())

    # Historical rolling average correlations
    rolling_avgs = []
    for i in range(history_window, len(returns)):
        chunk = returns.iloc[i - window:i]
        corr = chunk.corr()
        avg = float(corr.values[mask].mean())
        rolling_avgs.append(avg)

    percentile = (np.array(rolling_avgs) < current_avg).mean() * 100

    return {
        "current_avg_corr": current_avg,
        "historical_percentile": percentile,
        "is_spike": percentile > threshold_percentile,
    }
```

### Position Limits

Hard limits that prevent any single position or concentration from threatening the portfolio:

```python
# risk/position_limits.py
from dataclasses import dataclass

@dataclass
class PositionLimits:
    """Hard position limits enforced before every trade."""
    max_position_pct: float = 0.10  # 10% max per instrument
    max_sector_pct: float = 0.30  # 30% max per sector
    max_concentration_pct: float = 0.50  # 50% max in top 3 positions
    max_gross_exposure: float = 1.0  # 100% (no leverage)
    max_net_exposure: float = 0.50  # 50% max net long or short
    max_single_day_turnover: float = 0.30  # 30% max daily turnover

    def check_trade(
        self,
        proposed_position_pct: float,
        current_sector_pct: float,
        current_gross_exposure: float,
    ) -> tuple[bool, str]:
        """Check if a proposed trade violates any limit."""
        if proposed_position_pct > self.max_position_pct:
            return False, f"Position {proposed_position_pct:.1%} exceeds max {self.max_position_pct:.1%}"
        if current_sector_pct > self.max_sector_pct:
            return False, f"Sector exposure {current_sector_pct:.1%} exceeds max {self.max_sector_pct:.1%}"
        if current_gross_exposure > self.max_gross_exposure:
            return False, f"Gross exposure {current_gross_exposure:.1%} exceeds max {self.max_gross_exposure:.1%}"
        return True, "OK"
```

### Drawdown Controls

Drawdown controls cap cumulative losses and enforce recovery discipline:

```python
# risk/drawdown_controls.py
from dataclasses import dataclass
from enum import Enum

class DrawdownAction(Enum):
    NORMAL = "normal"  # Full position sizing
    REDUCED = "reduced"  # Half position sizes
    HALTED = "halted"  # No new positions (close existing)

@dataclass
class DrawdownController:
    """Multi-tier drawdown control system."""
    warn_threshold: float = 0.10  # 10% — log warning, reduce size
    halt_threshold: float = 0.15  # 15% — stop opening new positions
    kill_threshold: float = 0.20  # 20% — close everything
    recovery_required: float = 0.50  # Must recover 50% of drawdown to resume

    def evaluate(self, current_drawdown: float,
                 recovered_pct: float = 0.0) -> DrawdownAction:
        """
        Determine trading action based on current drawdown.

        Args:
            current_drawdown: Current drawdown as positive fraction (e.g., 0.12 = 12%).
            recovered_pct: If in recovery mode, fraction of drawdown recovered.
        """
        dd = abs(current_drawdown)

        if dd >= self.kill_threshold:
            return DrawdownAction.HALTED

        if dd >= self.halt_threshold:
            if recovered_pct < self.recovery_required:
                return DrawdownAction.HALTED
            return DrawdownAction.REDUCED

        if dd >= self.warn_threshold:
            return DrawdownAction.REDUCED

        return DrawdownAction.NORMAL

    def scale_factor(self, action: DrawdownAction) -> float:
        """Return position size multiplier for the given action."""
        return {
            DrawdownAction.NORMAL: 1.0,
            DrawdownAction.REDUCED: 0.5,
            DrawdownAction.HALTED: 0.0,
        }[action]
```

### Kill Switches

Kill switches are automated circuit breakers that halt all activity when conditions become dangerous. They are the last line of defense:

```python
# risk/kill_switch.py
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

@dataclass
class KillSwitchConfig:
    """Automated circuit breaker configuration."""
    max_daily_loss_pct: float = 0.05  # 5% daily loss limit
    max_drawdown_pct: float = 0.20  # 20% total drawdown limit
    max_consecutive_losses: int = 10  # Stop after 10 straight losses
    max_volatility_multiple: float = 3.0  # 3x normal vol = halt
    cooldown_period: timedelta = timedelta(hours=24)  # Wait before resuming

class KillSwitch:
    """
    Automated trading halt system.

    Evaluates multiple independent triggers. If ANY trigger fires,
    all trading stops immediately. Requires manual acknowledgment
    or cooldown period before resuming.
    """

    def __init__(self, config: KillSwitchConfig):
        self.config = config
        self.is_active = False
        self.trigger_reason = ""
        self.triggered_at: datetime | None = None

    def check(
        self,
        daily_pnl_pct: float,
        total_drawdown_pct: float,
        consecutive_losses: int,
        current_vol_multiple: float,
    ) -> bool:
        """
        Check all kill switch triggers.

        Returns True if trading should be halted.
        """
        if abs(daily_pnl_pct) >= self.config.max_daily_loss_pct:
            self._trigger(f"Daily loss {daily_pnl_pct:.1%} exceeds {self.config.max_daily_loss_pct:.1%}")
            return True

        if abs(total_drawdown_pct) >= self.config.max_drawdown_pct:
            self._trigger(f"Drawdown {total_drawdown_pct:.1%} exceeds {self.config.max_drawdown_pct:.1%}")
            return True

        if consecutive_losses >= self.config.max_consecutive_losses:
            self._trigger(f"{consecutive_losses} consecutive losses")
            return True

        if current_vol_multiple >= self.config.max_volatility_multiple:
            self._trigger(f"Volatility {current_vol_multiple:.1f}x normal")
            return True

        return False

    def _trigger(self, reason: str) -> None:
        self.is_active = True
        self.trigger_reason = reason
        self.triggered_at = datetime.now()
        logger.critical("KILL SWITCH ACTIVATED: %s", reason)

    def can_resume(self) -> bool:
        """Check if cooldown period has elapsed."""
        if not self.is_active or self.triggered_at is None:
            return True
        elapsed = datetime.now() - self.triggered_at
        return elapsed >= self.config.cooldown_period

    def reset(self, acknowledge: bool = False) -> None:
        """Reset kill switch (requires explicit acknowledgment)."""
        if not acknowledge:
            raise ValueError("Kill switch reset requires explicit acknowledgment")
        logger.warning("Kill switch reset by operator (was: %s)", self.trigger_reason)
        self.is_active = False
        self.trigger_reason = ""
        self.triggered_at = None
```

### Risk Management Layering

Risk controls operate in layers, each independent of the others:

| Layer | Check | Frequency | Response |
|-------|-------|-----------|----------|
| 1. Regime | Market state classification | Daily | Adjust strategy parameters |
| 2. Position limits | Per-trade constraint check | Pre-trade | Reject or resize trade |
| 3. Drawdown control | Cumulative loss monitoring | Per-trade | Reduce size or halt |
| 4. Kill switch | Emergency circuit breaker | Real-time | Halt all trading |
| 5. Stress test | Scenario-based exposure | Weekly | Adjust portfolio if stressed |

Never rely on a single layer. Assume each layer will fail eventually -- the redundancy is what protects capital.
