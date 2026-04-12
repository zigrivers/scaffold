---
name: research-observability
description: Monitoring experiment loops including anomaly detection, resource tracking, progress dashboards, and alert thresholds for research projects
topics: [research, observability, monitoring, anomaly-detection, resource-tracking, dashboards, alerts]
---

Autonomous experiment loops can run for hours or days without human attention. Without observability, a loop can waste compute on a converged metric, silently produce garbage after a data pipeline failure, or exhaust disk space without anyone noticing. Observability for research is not about uptime SLAs -- it is about experiment health: is the loop making progress, are the results valid, and are resources being consumed at a reasonable rate.

## Summary

Monitor three dimensions of experiment loop health: progress (is the primary metric improving, how much budget remains), validity (are results within expected ranges, are there anomalies in metric distributions), and resources (CPU, memory, disk, GPU utilization, and cost). Implement structured logging with metric history, anomaly detection on metric time series, and alerting for budget thresholds and stalled progress. Provide both real-time terminal output and persistent dashboards for async review.

## Deep Guidance

### Structured Logging

Use structured logging (JSON lines) for all experiment output so it can be parsed programmatically:

```python
# src/observability/structured_log.py
import structlog
import sys

def configure_logging(log_path: str | None = None, level: str = "INFO"):
    """Configure structured logging for the experiment loop."""
    processors = [
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if log_path:
        # JSON to file for machine parsing
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Human-readable to terminal
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.PrintLoggerFactory(
            file=open(log_path, "a") if log_path else sys.stderr
        ),
    )

    return structlog.get_logger()

# Usage in the experiment loop
logger = configure_logging("results/exp-001/log.jsonl")
logger.info("run_complete",
            run_id="run-0042",
            metrics={"sharpe": 1.45, "max_dd": 0.12},
            decision="keep",
            budget_remaining={"runs": 458, "time_hours": 36.2})
```

### Progress Monitoring

Track experiment progress and detect stalls:

```python
# src/observability/progress.py
import time
from dataclasses import dataclass, field

@dataclass
class ProgressMonitor:
    """Track experiment loop progress and detect stalls."""
    total_budget: int = 500
    start_time: float = field(default_factory=time.time)
    metric_history: list[float] = field(default_factory=list)
    best_value: float = float("-inf")
    best_iteration: int = 0
    stall_threshold: int = 50  # Iterations without improvement

    def update(self, iteration: int, metric_value: float) -> dict:
        """Update progress and return status report."""
        self.metric_history.append(metric_value)

        if metric_value > self.best_value:
            self.best_value = metric_value
            self.best_iteration = iteration

        elapsed = time.time() - self.start_time
        runs_per_hour = iteration / (elapsed / 3600) if elapsed > 0 else 0
        remaining_runs = self.total_budget - iteration
        eta_hours = remaining_runs / runs_per_hour if runs_per_hour > 0 else float("inf")

        stalled = (iteration - self.best_iteration) >= self.stall_threshold

        return {
            "iteration": iteration,
            "current_metric": metric_value,
            "best_metric": self.best_value,
            "best_at_iteration": self.best_iteration,
            "runs_since_improvement": iteration - self.best_iteration,
            "elapsed_hours": elapsed / 3600,
            "runs_per_hour": runs_per_hour,
            "eta_hours": eta_hours,
            "budget_used_pct": (iteration / self.total_budget) * 100,
            "stalled": stalled,
        }

    def format_status_line(self, status: dict) -> str:
        """Format a one-line progress summary for terminal output."""
        return (
            f"[{status['iteration']}/{self.total_budget}] "
            f"best={status['best_metric']:.4f} (iter {status['best_at_iteration']}) "
            f"current={status['current_metric']:.4f} "
            f"rate={status['runs_per_hour']:.1f}/hr "
            f"ETA={status['eta_hours']:.1f}h "
            f"{'STALLED' if status['stalled'] else 'ok'}"
        )
```

### Anomaly Detection on Metrics

Detect when metric values are outside expected ranges, which may indicate data issues or bugs:

```python
# src/observability/anomaly.py
import numpy as np
from typing import Optional

class MetricAnomalyDetector:
    """Detect anomalous metric values using statistical bounds."""

    def __init__(self, warmup: int = 20, z_threshold: float = 3.0):
        self.warmup = warmup
        self.z_threshold = z_threshold
        self.values: list[float] = []

    def check(self, value: float) -> Optional[dict]:
        """
        Check if a metric value is anomalous.
        Returns anomaly info dict if detected, None otherwise.
        """
        self.values.append(value)

        if len(self.values) < self.warmup:
            return None  # Not enough data for reliable detection

        arr = np.array(self.values[:-1])  # Exclude current value
        mean = arr.mean()
        std = arr.std()

        if std < 1e-10:  # All values identical (degenerate case)
            return None

        z_score = (value - mean) / std

        if abs(z_score) > self.z_threshold:
            return {
                "value": value,
                "mean": float(mean),
                "std": float(std),
                "z_score": float(z_score),
                "direction": "high" if z_score > 0 else "low",
                "message": (
                    f"Anomalous metric: {value:.4f} "
                    f"(z={z_score:.2f}, expected {mean:.4f} +/- {std:.4f})"
                ),
            }

        return None

class MultiMetricAnomalyDetector:
    """Monitor multiple metrics simultaneously."""

    def __init__(self, metric_names: list[str], **kwargs):
        self.detectors = {name: MetricAnomalyDetector(**kwargs) for name in metric_names}

    def check_all(self, metrics: dict[str, float]) -> list[dict]:
        """Check all metrics and return any anomalies found."""
        anomalies = []
        for name, value in metrics.items():
            if name in self.detectors:
                anomaly = self.detectors[name].check(value)
                if anomaly:
                    anomaly["metric_name"] = name
                    anomalies.append(anomaly)
        return anomalies
```

### Resource Tracking

Monitor compute resource consumption during experiment execution:

```python
# src/observability/resources.py
import os
import time
from dataclasses import dataclass

@dataclass
class ResourceSnapshot:
    """Point-in-time resource usage."""
    timestamp: float
    cpu_percent: float
    memory_mb: float
    disk_used_mb: float
    gpu_memory_mb: float | None = None
    gpu_utilization_pct: float | None = None

def capture_resources(results_dir: str) -> ResourceSnapshot:
    """Capture current resource usage."""
    import psutil

    process = psutil.Process(os.getpid())

    # CPU and memory
    cpu_pct = process.cpu_percent(interval=0.1)
    mem_mb = process.memory_info().rss / (1024 * 1024)

    # Disk usage of results directory
    disk_mb = sum(
        f.stat().st_size for f in _walk_files(results_dir)
    ) / (1024 * 1024)

    # GPU (optional)
    gpu_mem = None
    gpu_util = None
    try:
        import torch
        if torch.cuda.is_available():
            gpu_mem = torch.cuda.memory_allocated() / (1024 * 1024)
            # Note: utilization requires nvidia-smi or pynvml
    except ImportError:
        pass

    return ResourceSnapshot(
        timestamp=time.time(),
        cpu_percent=cpu_pct,
        memory_mb=mem_mb,
        disk_used_mb=disk_mb,
        gpu_memory_mb=gpu_mem,
        gpu_utilization_pct=gpu_util,
    )

def _walk_files(directory: str):
    """Walk directory and yield all files."""
    from pathlib import Path
    for path in Path(directory).rglob("*"):
        if path.is_file():
            yield path

class ResourceBudgetTracker:
    """Track cumulative resource consumption against budget."""

    def __init__(self, max_disk_mb: float = 10240, max_memory_mb: float = 8192):
        self.max_disk_mb = max_disk_mb
        self.max_memory_mb = max_memory_mb
        self.history: list[ResourceSnapshot] = []

    def record(self, snapshot: ResourceSnapshot) -> list[str]:
        """Record a snapshot and return any budget warnings."""
        self.history.append(snapshot)
        warnings = []

        if snapshot.disk_used_mb > self.max_disk_mb * 0.8:
            warnings.append(
                f"Disk usage at {snapshot.disk_used_mb:.0f}MB "
                f"({snapshot.disk_used_mb / self.max_disk_mb * 100:.0f}% of budget)"
            )
        if snapshot.memory_mb > self.max_memory_mb * 0.9:
            warnings.append(
                f"Memory usage at {snapshot.memory_mb:.0f}MB "
                f"({snapshot.memory_mb / self.max_memory_mb * 100:.0f}% of budget)"
            )

        return warnings
```

### Alert System

Alert on conditions that require attention:

```python
# src/observability/alerts.py
from dataclasses import dataclass
from enum import Enum
from typing import Callable

class AlertSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

@dataclass
class Alert:
    severity: AlertSeverity
    message: str
    metric_name: str = ""
    value: float = 0.0

class AlertManager:
    """Configurable alert system for experiment monitoring."""

    def __init__(self):
        self.rules: list[tuple[str, Callable, AlertSeverity]] = []
        self.fired: list[Alert] = []

    def add_rule(self, name: str, condition: Callable[[dict], bool],
                 severity: AlertSeverity, message_template: str) -> None:
        self.rules.append((name, condition, severity, message_template))

    def check(self, status: dict) -> list[Alert]:
        """Evaluate all rules against current status."""
        alerts = []
        for name, condition, severity, msg_template in self.rules:
            try:
                if condition(status):
                    alert = Alert(
                        severity=severity,
                        message=msg_template.format(**status),
                    )
                    alerts.append(alert)
                    self.fired.append(alert)
            except (KeyError, TypeError):
                pass
        return alerts

# Default alert rules
def default_alerts() -> AlertManager:
    mgr = AlertManager()
    mgr.add_rule(
        "stall_warning",
        lambda s: s.get("runs_since_improvement", 0) >= 30,
        AlertSeverity.WARNING,
        "Stalled: {runs_since_improvement} runs without improvement",
    )
    mgr.add_rule(
        "budget_critical",
        lambda s: s.get("budget_used_pct", 0) >= 90,
        AlertSeverity.CRITICAL,
        "Budget nearly exhausted: {budget_used_pct:.0f}% used",
    )
    mgr.add_rule(
        "error_rate",
        lambda s: s.get("consecutive_errors", 0) >= 5,
        AlertSeverity.CRITICAL,
        "High error rate: {consecutive_errors} consecutive failures",
    )
    return mgr
```

### Terminal Dashboard

For real-time monitoring during autonomous execution:

```python
# src/observability/dashboard.py
import sys

def print_dashboard(status: dict, alerts: list, resource: dict) -> None:
    """Print a compact terminal dashboard."""
    # Clear and redraw
    sys.stderr.write("\033[2J\033[H")  # Clear screen, cursor to top

    print("=" * 60)
    print(f"  Experiment: {status.get('experiment_id', 'unknown')}")
    print(f"  Iteration:  {status['iteration']}/{status.get('total_budget', '?')}")
    print(f"  Best:       {status['best_metric']:.6f} (iter {status['best_at_iteration']})")
    print(f"  Current:    {status['current_metric']:.6f}")
    print(f"  Rate:       {status['runs_per_hour']:.1f} runs/hr")
    print(f"  ETA:        {status['eta_hours']:.1f} hours")
    print("-" * 60)
    print(f"  CPU: {resource.get('cpu_percent', 0):.0f}%  "
          f"MEM: {resource.get('memory_mb', 0):.0f}MB  "
          f"DISK: {resource.get('disk_used_mb', 0):.0f}MB")
    if resource.get("gpu_memory_mb") is not None:
        print(f"  GPU MEM: {resource['gpu_memory_mb']:.0f}MB")
    print("-" * 60)

    if alerts:
        for alert in alerts:
            prefix = "!!" if alert.severity.value == "critical" else "!"
            print(f"  {prefix} {alert.message}")
    else:
        print("  No alerts")
    print("=" * 60)
```

### Observability Best Practices

1. **Log every iteration**: Even discarded runs produce valuable data about what does not work.
2. **Structured over unstructured**: JSON lines, not free-form text. Machine-parseable logs enable automated analysis.
3. **Separate experiment logs from system logs**: Experiment metrics go to the results directory. System health goes to stderr or a system log.
4. **Alert on stalls, not just failures**: A loop that is not improving is wasting compute, even if it is not crashing.
5. **Resource snapshots at regular intervals**: Capture every N iterations, not just at start and end. Memory leaks and disk growth are only visible over time.
6. **Persistent dashboards for async review**: Write dashboard HTML to the results directory so reviewers can check progress without a live terminal session.
7. **Cost tracking**: If running on cloud infrastructure, track estimated cost per run and alert when the cost budget is approaching its limit.
