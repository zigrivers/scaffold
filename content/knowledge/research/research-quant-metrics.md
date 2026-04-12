---
name: research-quant-metrics
description: Quantitative performance metrics including Sharpe ratio, Sortino ratio, Calmar ratio, maximum drawdown, profit factor, win rate, expectancy, and alpha/beta decomposition
topics: [research, quant-finance, metrics, sharpe, sortino, calmar, drawdown, profit-factor, information-ratio, alpha, beta]
---

Performance metrics are the lens through which every trading strategy is evaluated. A single metric is never sufficient -- strategies must be assessed across multiple dimensions including risk-adjusted return, tail risk, consistency, and independence from market direction. The choice of which metric to optimize (primary target) versus which to constrain (guardrails) is a fundamental research design decision. Optimizing the wrong metric or ignoring important dimensions leads to strategies that look good on paper but blow up in practice.

## Summary

Implement a comprehensive metrics library covering risk-adjusted returns (Sharpe, Sortino, Calmar, information ratio), drawdown analysis (maximum drawdown, drawdown duration, recovery time), trade-level statistics (win rate, profit factor, expectancy, payoff ratio), and factor decomposition (alpha, beta, R-squared). Use annualized metrics with consistent conventions (252 trading days, risk-free rate from T-bills). Always compute confidence intervals via bootstrap resampling rather than relying on point estimates.

## Deep Guidance

### Risk-Adjusted Return Metrics

```python
# metrics/risk_adjusted.py
import numpy as np
import pandas as pd

def sharpe_ratio(
    returns: pd.Series,
    risk_free_rate: float = 0.04,
    periods_per_year: int = 252,
) -> float:
    """
    Annualized Sharpe ratio.

    Sharpe = (mean_return - risk_free_rate) / std_return
    Annualized by multiplying by sqrt(periods_per_year).
    """
    excess = returns - risk_free_rate / periods_per_year
    if excess.std() == 0:
        return 0.0
    return float(excess.mean() / excess.std() * np.sqrt(periods_per_year))


def sortino_ratio(
    returns: pd.Series,
    risk_free_rate: float = 0.04,
    periods_per_year: int = 252,
) -> float:
    """
    Sortino ratio — like Sharpe but uses downside deviation only.

    Penalises downside volatility more heavily, which is often more
    relevant since upside volatility is desirable.
    """
    excess = returns - risk_free_rate / periods_per_year
    downside = excess[excess < 0]
    downside_std = np.sqrt((downside**2).mean()) if len(downside) > 0 else 0.0
    if downside_std == 0:
        return 0.0
    return float(excess.mean() / downside_std * np.sqrt(periods_per_year))


def calmar_ratio(
    returns: pd.Series,
    periods_per_year: int = 252,
) -> float:
    """
    Calmar ratio — annualized return divided by maximum drawdown.

    Measures return per unit of worst-case risk.
    """
    ann_return = returns.mean() * periods_per_year
    max_dd = maximum_drawdown(returns)
    if max_dd == 0:
        return 0.0
    return float(ann_return / abs(max_dd))


def information_ratio(
    returns: pd.Series,
    benchmark_returns: pd.Series,
    periods_per_year: int = 252,
) -> float:
    """
    Information ratio — excess return over benchmark per unit of tracking error.

    Measures the consistency of active returns relative to a benchmark.
    """
    active_returns = returns - benchmark_returns
    tracking_error = active_returns.std()
    if tracking_error == 0:
        return 0.0
    return float(
        active_returns.mean() / tracking_error * np.sqrt(periods_per_year)
    )
```

### Drawdown Analysis

```python
# metrics/drawdown.py
import numpy as np
import pandas as pd
from dataclasses import dataclass

@dataclass
class DrawdownAnalysis:
    """Complete drawdown analysis results."""
    max_drawdown: float  # Worst peak-to-trough decline (negative)
    max_drawdown_duration: int  # Days in worst drawdown
    max_recovery_time: int  # Days to recover from worst drawdown
    avg_drawdown: float  # Average drawdown across all drawdown periods
    drawdown_series: pd.Series  # Full drawdown time series

def maximum_drawdown(returns: pd.Series) -> float:
    """Maximum peak-to-trough decline as a negative fraction."""
    equity = (1 + returns).cumprod()
    running_max = equity.cummax()
    drawdown = (equity - running_max) / running_max
    return float(drawdown.min())

def analyze_drawdowns(returns: pd.Series) -> DrawdownAnalysis:
    """Comprehensive drawdown analysis."""
    equity = (1 + returns).cumprod()
    running_max = equity.cummax()
    drawdown = (equity - running_max) / running_max

    # Find drawdown periods (contiguous sequences where drawdown < 0)
    in_drawdown = drawdown < 0
    dd_starts = in_drawdown & ~in_drawdown.shift(1, fill_value=False)
    dd_ends = ~in_drawdown & in_drawdown.shift(1, fill_value=False)

    # Calculate duration of worst drawdown
    max_dd = drawdown.min()
    max_dd_idx = drawdown.idxmin()

    # Find the peak before the max drawdown
    peak_idx = equity[:max_dd_idx].idxmax()
    dd_duration = len(equity[peak_idx:max_dd_idx])

    # Find recovery point after max drawdown
    post_dd = equity[max_dd_idx:]
    peak_val = equity[peak_idx]
    recovered = post_dd[post_dd >= peak_val]
    recovery_time = len(post_dd[:recovered.index[0]]) if len(recovered) > 0 else -1

    return DrawdownAnalysis(
        max_drawdown=max_dd,
        max_drawdown_duration=dd_duration,
        max_recovery_time=recovery_time,
        avg_drawdown=float(drawdown[drawdown < 0].mean()) if (drawdown < 0).any() else 0.0,
        drawdown_series=drawdown,
    )
```

### Trade-Level Statistics

```python
# metrics/trade_stats.py
import numpy as np
from dataclasses import dataclass

@dataclass
class TradeStatistics:
    """Statistics computed from individual trade P&L records."""
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float  # Fraction of winning trades
    avg_win: float  # Average winning trade P&L
    avg_loss: float  # Average losing trade P&L (negative)
    profit_factor: float  # Gross profit / gross loss
    expectancy: float  # Expected P&L per trade
    payoff_ratio: float  # avg_win / abs(avg_loss)
    max_consecutive_wins: int
    max_consecutive_losses: int

def compute_trade_statistics(trade_pnls: list[float]) -> TradeStatistics:
    """Compute comprehensive trade-level statistics from P&L list."""
    pnls = np.array(trade_pnls)
    wins = pnls[pnls > 0]
    losses = pnls[pnls < 0]

    total = len(pnls)
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = win_count / total if total > 0 else 0.0

    avg_win = float(wins.mean()) if len(wins) > 0 else 0.0
    avg_loss = float(losses.mean()) if len(losses) > 0 else 0.0

    gross_profit = float(wins.sum()) if len(wins) > 0 else 0.0
    gross_loss = float(abs(losses.sum())) if len(losses) > 0 else 0.0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

    expectancy = float(pnls.mean()) if total > 0 else 0.0
    payoff_ratio = avg_win / abs(avg_loss) if avg_loss != 0 else float("inf")

    # Consecutive wins/losses
    max_consec_wins = _max_consecutive(pnls > 0)
    max_consec_losses = _max_consecutive(pnls < 0)

    return TradeStatistics(
        total_trades=total,
        winning_trades=win_count,
        losing_trades=loss_count,
        win_rate=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
        profit_factor=profit_factor,
        expectancy=expectancy,
        payoff_ratio=payoff_ratio,
        max_consecutive_wins=max_consec_wins,
        max_consecutive_losses=max_consec_losses,
    )

def _max_consecutive(mask: np.ndarray) -> int:
    """Count the longest consecutive True run in a boolean array."""
    if len(mask) == 0:
        return 0
    max_run = 0
    current_run = 0
    for val in mask:
        if val:
            current_run += 1
            max_run = max(max_run, current_run)
        else:
            current_run = 0
    return max_run
```

### Alpha/Beta Decomposition

```python
# metrics/factor.py
import numpy as np
import pandas as pd
from dataclasses import dataclass

@dataclass
class FactorDecomposition:
    """Alpha/beta decomposition against a benchmark."""
    alpha: float  # Annualized excess return not explained by benchmark
    beta: float  # Sensitivity to benchmark returns
    r_squared: float  # Fraction of variance explained by benchmark
    residual_vol: float  # Annualized volatility of unexplained returns

def decompose_returns(
    strategy_returns: pd.Series,
    benchmark_returns: pd.Series,
    risk_free_rate: float = 0.04,
    periods_per_year: int = 252,
) -> FactorDecomposition:
    """
    Decompose strategy returns into alpha and beta components.

    Uses OLS regression: R_strategy = alpha + beta * R_benchmark + epsilon
    """
    aligned = pd.concat(
        [strategy_returns, benchmark_returns], axis=1, keys=["strat", "bench"]
    ).dropna()

    rf_daily = risk_free_rate / periods_per_year
    excess_strat = aligned["strat"] - rf_daily
    excess_bench = aligned["bench"] - rf_daily

    beta = float(
        np.cov(excess_strat, excess_bench)[0, 1]
        / np.var(excess_bench)
    )

    alpha_daily = float(excess_strat.mean() - beta * excess_bench.mean())
    alpha_annual = alpha_daily * periods_per_year

    residuals = excess_strat - beta * excess_bench
    ss_res = float((residuals**2).sum())
    ss_tot = float(((excess_strat - excess_strat.mean()) ** 2).sum())
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    residual_vol = float(residuals.std() * np.sqrt(periods_per_year))

    return FactorDecomposition(
        alpha=alpha_annual,
        beta=beta,
        r_squared=r_squared,
        residual_vol=residual_vol,
    )
```

### Bootstrap Confidence Intervals

Point estimates are unreliable. Always compute confidence intervals:

```python
# metrics/bootstrap.py
import numpy as np

def bootstrap_sharpe_ci(
    returns: np.ndarray,
    n_bootstrap: int = 10_000,
    confidence: float = 0.95,
    periods_per_year: int = 252,
) -> tuple[float, float, float]:
    """
    Bootstrap confidence interval for the Sharpe ratio.

    Returns:
        Tuple of (point_estimate, ci_lower, ci_upper).
    """
    n = len(returns)
    sharpes = np.empty(n_bootstrap)

    for i in range(n_bootstrap):
        sample = np.random.choice(returns, size=n, replace=True)
        if sample.std() > 0:
            sharpes[i] = sample.mean() / sample.std() * np.sqrt(periods_per_year)
        else:
            sharpes[i] = 0.0

    alpha = (1 - confidence) / 2
    ci_lower = float(np.percentile(sharpes, alpha * 100))
    ci_upper = float(np.percentile(sharpes, (1 - alpha) * 100))
    point = float(np.mean(sharpes))

    return point, ci_lower, ci_upper
```

### Metrics Interpretation Guide

| Metric | Excellent | Good | Marginal | Poor |
|--------|-----------|------|----------|------|
| Sharpe ratio | > 2.0 | 1.0 - 2.0 | 0.5 - 1.0 | < 0.5 |
| Sortino ratio | > 3.0 | 1.5 - 3.0 | 0.7 - 1.5 | < 0.7 |
| Calmar ratio | > 3.0 | 1.0 - 3.0 | 0.5 - 1.0 | < 0.5 |
| Max drawdown | < 10% | 10 - 20% | 20 - 30% | > 30% |
| Profit factor | > 2.0 | 1.5 - 2.0 | 1.0 - 1.5 | < 1.0 |
| Win rate | > 55% | 45 - 55% | 35 - 45% | < 35% |
| Information ratio | > 1.0 | 0.5 - 1.0 | 0.2 - 0.5 | < 0.2 |

Caution: These thresholds are for daily-frequency strategies. Higher-frequency strategies typically have higher Sharpe ratios but lower capacity, and lower-frequency strategies have lower Sharpe ratios but higher capacity.
