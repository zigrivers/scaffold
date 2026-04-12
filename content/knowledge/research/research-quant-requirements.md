---
name: research-quant-requirements
description: Trading system research requirements including strategy hypothesis definition, market regime assumptions, risk budgets, data requirements, and performance targets
topics: [research, quant-finance, requirements, hypothesis, risk-budget, performance-targets, validation]
---

Trading strategy research requires requirements that go far beyond "find a profitable strategy." Every research project must define the strategy hypothesis with falsifiable predictions, declare market regime assumptions that bound the strategy's expected operating environment, establish risk budgets that constrain position sizing and drawdown limits, specify data requirements including quality standards and survivorship-bias-free universes, set performance targets with statistical significance thresholds, and mandate out-of-sample validation protocols. Without these constraints, a backtest will always find something that looks good on historical data -- the question is whether it will survive contact with live markets.

## Summary

Define trading research requirements as structured hypotheses with quantitative success criteria (Sharpe > X, max drawdown < Y%), explicit market regime assumptions (trending, mean-reverting, crisis), risk budgets (max position size, sector exposure, portfolio heat), data requirements (instrument universe, frequency, lookback period, survivorship-bias-free), and mandatory out-of-sample validation windows. Separate primary optimization targets from hard guardrails. Require statistical significance testing (minimum trade count, bootstrap confidence intervals) before any strategy is considered validated.

## Deep Guidance

### Strategy Hypothesis Structure

Every quant research hypothesis must specify the market inefficiency being exploited, the mechanism by which the strategy captures it, and the conditions under which it should fail:

```python
# configs/quant_hypothesis.py
from dataclasses import dataclass, field
from enum import Enum

class MarketRegime(Enum):
    TRENDING = "trending"
    MEAN_REVERTING = "mean_reverting"
    HIGH_VOLATILITY = "high_volatility"
    LOW_VOLATILITY = "low_volatility"
    CRISIS = "crisis"

@dataclass
class StrategyHypothesis:
    """Structured hypothesis for a trading strategy research project."""
    hypothesis_id: str
    name: str
    inefficiency: str  # What market inefficiency is being exploited
    mechanism: str  # How the strategy captures the inefficiency
    expected_regimes: list[MarketRegime]  # Regimes where strategy should work
    failure_regimes: list[MarketRegime]  # Regimes where strategy should fail
    instruments: list[str]  # Target instrument universe
    timeframe: str  # Primary timeframe (e.g., "1D", "1H", "5m")
    min_sharpe: float = 1.5  # Minimum Sharpe ratio target
    max_drawdown: float = 0.15  # Maximum acceptable drawdown (15%)
    min_trades: int = 100  # Minimum trades for statistical significance
    oos_ratio: float = 0.3  # Out-of-sample data ratio

    def validate(self) -> list[str]:
        """Check hypothesis completeness."""
        issues = []
        if not self.inefficiency:
            issues.append("Must specify the market inefficiency being exploited")
        if not self.failure_regimes:
            issues.append("Must specify regimes where strategy is expected to fail")
        if self.min_trades < 30:
            issues.append("Minimum 30 trades required for statistical significance")
        if self.oos_ratio < 0.2:
            issues.append("Out-of-sample ratio should be at least 20%")
        return issues


# Example hypothesis
momentum_hypothesis = StrategyHypothesis(
    hypothesis_id="H-001",
    name="Adaptive momentum crossover",
    inefficiency="Price trends persist due to institutional herding and gradual information diffusion",
    mechanism="Dual moving average crossover with volatility-adaptive lookback periods",
    expected_regimes=[MarketRegime.TRENDING, MarketRegime.LOW_VOLATILITY],
    failure_regimes=[MarketRegime.MEAN_REVERTING, MarketRegime.CRISIS],
    instruments=["SPY", "QQQ", "IWM", "EFA", "EEM"],
    timeframe="1D",
    min_sharpe=1.5,
    max_drawdown=0.15,
    min_trades=200,
    oos_ratio=0.3,
)
```

### Market Regime Assumptions

Strategies do not operate in a vacuum. Document which market regimes the strategy targets and how regime detection will gate live deployment:

```python
# configs/regime_assumptions.py
from dataclasses import dataclass

@dataclass
class RegimeAssumption:
    """A documented assumption about market regime behavior."""
    regime: str
    volatility_range: tuple[float, float]  # Annualized vol range
    correlation_expectation: str  # e.g., "cross-asset correlations < 0.5"
    historical_frequency: float  # Fraction of time market is in this regime
    strategy_expectation: str  # What we expect the strategy to do

regime_assumptions = [
    RegimeAssumption(
        regime="trending_low_vol",
        volatility_range=(0.08, 0.18),
        correlation_expectation="Sector correlations moderate (0.3-0.6)",
        historical_frequency=0.45,
        strategy_expectation="Primary alpha generation, Sharpe > 2.0",
    ),
    RegimeAssumption(
        regime="mean_reverting",
        volatility_range=(0.10, 0.22),
        correlation_expectation="Cross-asset correlations low (<0.3)",
        historical_frequency=0.25,
        strategy_expectation="Flat to slightly negative, drawdown < 5%",
    ),
    RegimeAssumption(
        regime="crisis",
        volatility_range=(0.30, 0.80),
        correlation_expectation="Correlations spike to > 0.8",
        historical_frequency=0.10,
        strategy_expectation="Strategy should be flat (kill switch active)",
    ),
]
```

### Risk Budget Requirements

Risk budgets define the hard constraints that no backtest optimization is allowed to violate. These are guardrails, not optimization targets:

| Risk Dimension | Typical Constraint | Enforcement |
|---------------|-------------------|-------------|
| Max position size | 5-10% of portfolio per instrument | Pre-trade check |
| Max sector exposure | 25-30% in any single sector | Pre-trade check |
| Max portfolio heat | 2-3% total risk per day | Daily limit |
| Max drawdown | 15-25% from peak | Kill switch |
| Max correlation to benchmark | 0.7 (if seeking alpha, not beta) | Monthly review |
| Min cash reserve | 10-20% uninvested | Rebalance trigger |

```python
# configs/risk_budget.py
from dataclasses import dataclass

@dataclass
class RiskBudget:
    """Hard risk constraints for strategy research."""
    max_position_pct: float = 0.10  # 10% max per instrument
    max_sector_pct: float = 0.30  # 30% max per sector
    max_daily_risk_pct: float = 0.02  # 2% portfolio heat per day
    max_drawdown_pct: float = 0.20  # 20% max drawdown (kill switch)
    max_leverage: float = 1.0  # No leverage by default
    min_cash_pct: float = 0.10  # 10% cash reserve
    max_correlation_to_benchmark: float = 0.70

    def check_position(self, position_pct: float) -> bool:
        return position_pct <= self.max_position_pct

    def check_drawdown(self, current_drawdown: float) -> bool:
        return current_drawdown <= self.max_drawdown_pct
```

### Data Requirements Specification

Data requirements must be explicit about instrument universe, frequency, lookback period, and quality standards:

```python
# configs/data_requirements.py
from dataclasses import dataclass, field
from datetime import date

@dataclass
class DataRequirements:
    """Minimum data requirements for the research project."""
    instruments: list[str]  # Ticker symbols or identifiers
    frequency: str  # "1m", "5m", "1H", "1D"
    start_date: date  # Earliest required data point
    end_date: date  # Latest required data point
    survivorship_bias_free: bool = True  # Require delisted stocks
    adjusted_for_splits: bool = True  # Corporate action adjusted
    adjusted_for_dividends: bool = True  # Dividend adjusted
    min_history_days: int = 252 * 5  # 5 years minimum
    max_gap_days: int = 5  # Max consecutive missing days
    required_fields: list[str] = field(
        default_factory=lambda: ["open", "high", "low", "close", "volume"]
    )

    def validate_dataset(self, df) -> list[str]:
        """Validate a dataset meets requirements."""
        issues = []
        for col in self.required_fields:
            if col not in df.columns:
                issues.append(f"Missing required field: {col}")
        if df.isnull().any().any():
            null_pct = df.isnull().sum().sum() / df.size * 100
            if null_pct > 1.0:
                issues.append(f"Null values: {null_pct:.1f}% (max 1%)")
        return issues
```

### Performance Target Framework

Performance targets must distinguish between the optimization target (one metric), secondary indicators (useful but not optimized), and hard guardrails (never violated):

| Category | Metric | Target | Rationale |
|----------|--------|--------|-----------|
| **Primary** | Sharpe ratio (OOS) | > 1.5 | Risk-adjusted return is the universal benchmark |
| Secondary | Sortino ratio | > 2.0 | Penalizes downside more than upside volatility |
| Secondary | Win rate | > 45% | Indicates strategy consistency |
| Secondary | Profit factor | > 1.5 | Gross profit / gross loss |
| **Guardrail** | Max drawdown | < 20% | Capital preservation |
| **Guardrail** | Min trades | > 100 | Statistical significance |
| **Guardrail** | Max consecutive losses | < 10 | Psychological tolerance |

### Out-of-Sample Validation Requirements

No strategy is considered validated until it passes out-of-sample testing. The validation protocol must be defined before the first experiment runs:

1. **Time-based split**: Reserve the most recent 30% of data as out-of-sample. Never touch it during development.
2. **Walk-forward validation**: Use rolling windows (e.g., 252-day train, 63-day test) to simulate realistic deployment.
3. **Multiple market regimes**: OOS period must include at least two distinct regime types.
4. **Statistical significance**: Bootstrap the strategy returns (1000+ iterations) and require the 5th percentile Sharpe > 0.
5. **Comparison to benchmarks**: Beat buy-and-hold AND a simple momentum benchmark on a risk-adjusted basis.

### Requirements Anti-Patterns in Quant Research

- **Overfitting the requirements**: Setting Sharpe target to match exactly what your best backtest achieved.
- **Survivorship bias in instrument selection**: Using today's S&P 500 constituents for a 20-year backtest.
- **Ignoring transaction costs**: A strategy that trades 50 times per day needs very different targets than one that trades monthly.
- **No regime awareness**: "Works in all market conditions" is a red flag -- no strategy does.
- **Optimizing guardrails**: If max drawdown is a guardrail, do not run optimizations that minimize drawdown -- it becomes a de facto primary target and distorts the search.
