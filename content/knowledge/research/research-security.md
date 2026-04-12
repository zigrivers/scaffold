---
name: research-security
description: Security for autonomous research agents including sandboxing experiment execution, resource limits, credential isolation, and code injection prevention
topics: [research, security, sandboxing, resource-limits, credentials, code-injection, autonomous-agents]
---

Autonomous research agents run code, modify files, and access data without human oversight during each iteration. This creates a security surface that traditional software projects do not have: the agent can accidentally run destructive operations, consume unbounded resources, leak credentials through experiment outputs, or produce code that introduces injection vulnerabilities. Security must be enforced at the infrastructure level -- relying on the agent to "be careful" is not a security strategy.

## Summary

Sandbox experiment runs using OS-level isolation (containers, cgroups, filesystem restrictions) so that a runaway experiment cannot affect the host system. Enforce resource limits (CPU time, memory, disk, network) at the process level. Isolate credentials from experiment code using environment injection with read-only access. Prevent code injection by validating all experiment-generated code before running it. Log all agent actions for audit and anomaly detection.

## Deep Guidance

### Sandboxing Experiment Execution

Every experiment run should run in an isolated environment that limits blast radius:

```python
# src/security/sandbox.py
import subprocess
import os
import signal
from dataclasses import dataclass

@dataclass
class SandboxLimits:
    """Resource limits for sandboxed experiment runs."""
    max_cpu_seconds: int = 300       # 5 minutes per run
    max_memory_mb: int = 4096        # 4 GB
    max_disk_mb: int = 1024          # 1 GB scratch space
    max_processes: int = 32          # Subprocess limit
    network_enabled: bool = False     # Disable network by default
    writable_paths: list[str] | None = None  # Whitelist

class ProcessSandbox:
    """
    Sandboxed run using OS-level resource limits.
    Uses ulimit on Linux/macOS for basic resource control.
    For production use, prefer containers (Docker) or VMs.
    """

    def __init__(self, limits: SandboxLimits):
        self.limits = limits

    def run_sandboxed(self, command: list[str], cwd: str | None = None,
                      env: dict[str, str] | None = None) -> subprocess.CompletedProcess:
        """Run a command within resource limits."""
        safe_env = self._build_safe_env(env)

        def set_limits():
            import resource
            # CPU time limit
            resource.setrlimit(
                resource.RLIMIT_CPU,
                (self.limits.max_cpu_seconds, self.limits.max_cpu_seconds),
            )
            # Memory limit
            mem_bytes = self.limits.max_memory_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
            # Process limit
            resource.setrlimit(
                resource.RLIMIT_NPROC,
                (self.limits.max_processes, self.limits.max_processes),
            )

        try:
            result = subprocess.run(
                command,
                cwd=cwd,
                env=safe_env,
                capture_output=True,
                text=True,
                timeout=self.limits.max_cpu_seconds + 30,
                preexec_fn=set_limits,
            )
            return result
        except subprocess.TimeoutExpired:
            raise RuntimeError(
                f"Experiment exceeded time limit ({self.limits.max_cpu_seconds}s)"
            )

    def _build_safe_env(self, extra_env: dict[str, str] | None = None) -> dict[str, str]:
        """Build a minimal, safe environment."""
        safe = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": os.environ.get("HOME", "/tmp"),
            "LANG": "en_US.UTF-8",
        }
        venv = os.environ.get("VIRTUAL_ENV")
        if venv:
            safe["VIRTUAL_ENV"] = venv
            safe["PATH"] = f"{venv}/bin:{safe['PATH']}"
        if extra_env:
            safe.update(extra_env)
        return safe
```

### Container-Based Isolation

For stronger isolation, run experiments in containers:

```python
# src/security/container_sandbox.py
import subprocess
from dataclasses import dataclass

@dataclass
class ContainerConfig:
    image: str = "python:3.11-slim"
    memory_limit: str = "4g"
    cpu_limit: str = "2.0"
    network_mode: str = "none"
    read_only_root: bool = True
    tmpfs_size: str = "1g"

def run_in_container(command: str, config: ContainerConfig,
                     volumes: dict[str, str] | None = None,
                     env: dict[str, str] | None = None) -> dict:
    """Run an experiment command inside a Docker container."""
    docker_cmd = [
        "docker", "run", "--rm",
        "--memory", config.memory_limit,
        "--cpus", config.cpu_limit,
        "--network", config.network_mode,
    ]

    if config.read_only_root:
        docker_cmd.extend(["--read-only", "--tmpfs", f"/tmp:size={config.tmpfs_size}"])

    if volumes:
        for host_path, container_path in volumes.items():
            docker_cmd.extend(["-v", f"{host_path}:{container_path}"])

    if env:
        for key, value in env.items():
            docker_cmd.extend(["-e", f"{key}={value}"])

    docker_cmd.extend([config.image, "bash", "-c", command])

    result = subprocess.run(docker_cmd, capture_output=True, text=True, timeout=600)
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }
```

### Resource Limits

Enforce limits at multiple levels to prevent runaway experiments:

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| CPU time | Per-run timeout | `subprocess.timeout` + `RLIMIT_CPU` |
| Memory | Per-process cap | `RLIMIT_AS` or Docker `--memory` |
| Disk | Scratch space quota | `tmpfs` with size limit |
| Network | Disabled by default | Docker `--network none` or firewall |
| Processes | Fork bomb prevention | `RLIMIT_NPROC` |
| GPU memory | Per-process fraction | `CUDA_VISIBLE_DEVICES` + framework limits |

```python
# GPU resource limiting
import os

def limit_gpu(device_ids: list[int], memory_fraction: float = 0.5) -> None:
    """Restrict GPU access for the current process."""
    os.environ["CUDA_VISIBLE_DEVICES"] = ",".join(str(i) for i in device_ids)

    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.set_per_process_memory_fraction(memory_fraction)
    except ImportError:
        pass
```

### Credential Isolation

Credentials (API keys, database passwords) must never be accessible to experiment code directly:

```python
# src/security/credentials.py
import os
from typing import Any

# Credentials that experiment code should NEVER have access to
BLOCKED_ENV_VARS = {
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "DATABASE_URL",
    "GITHUB_TOKEN",
    "GIT_AUTHOR_EMAIL",
}

def filtered_environment(allowed_vars: set[str] | None = None) -> dict[str, str]:
    """
    Return a filtered copy of environment variables.
    Blocks all known credential variables.
    Optionally restricts to only explicitly allowed variables.
    """
    env = {}
    for key, value in os.environ.items():
        if key in BLOCKED_ENV_VARS:
            continue
        if allowed_vars is not None and key not in allowed_vars:
            continue
        env[key] = value
    return env

def inject_data_credentials(env: dict[str, str],
                            data_config: dict[str, Any]) -> dict[str, str]:
    """
    Inject data access credentials into experiment environment.
    These are read-only credentials with minimal scope.
    """
    result = env.copy()
    if "data_source_path" in data_config:
        result["DATA_SOURCE_PATH"] = data_config["data_source_path"]
    if "api_key_env" in data_config:
        key = os.environ.get(data_config["api_key_env"], "")
        if key:
            result["DATA_API_KEY"] = key
    return result
```

### Code Injection Prevention

For code-driven experiments where the agent modifies source files, validate the generated code before running it:

```python
# src/security/code_validator.py
import ast
import re
from pathlib import Path

DANGEROUS_PATTERNS = [
    r"os\.system\(",
    r"shutil\.rmtree\(",
    r"__import__\(",
    r"compile\(",
    r"importlib\.import_module",
]

def validate_experiment_code(file_path: str) -> list[str]:
    """
    Validate that experiment code does not contain dangerous patterns.
    Returns list of violations (empty means safe).
    """
    violations = []
    content = Path(file_path).read_text()

    # Regex-based pattern detection
    for pattern in DANGEROUS_PATTERNS:
        matches = re.findall(pattern, content)
        if matches:
            violations.append(
                f"Dangerous pattern detected: {pattern} ({len(matches)} occurrences)"
            )

    # AST-based analysis for import validation
    try:
        tree = ast.parse(content)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in ("shutil", "ctypes"):
                        violations.append(
                            f"Forbidden import: {alias.name} (line {node.lineno})"
                        )
            elif isinstance(node, ast.ImportFrom):
                if node.module in ("shutil", "ctypes"):
                    violations.append(
                        f"Forbidden import from: {node.module} (line {node.lineno})"
                    )
    except SyntaxError as e:
        violations.append(f"Syntax error in generated code: {e}")

    return violations
```

### Filesystem Access Control

Restrict which paths the experiment can read and write:

```python
# src/security/filesystem.py
from pathlib import Path

class FilesystemPolicy:
    """Define read/write permissions for experiment runs."""

    def __init__(self, project_root: str):
        self.root = Path(project_root).resolve()
        self.readable = {
            self.root / "src",
            self.root / "configs",
            self.root / "data" / "raw",
            self.root / "data" / "processed",
            self.root / "tests" / "fixtures",
        }
        self.writable = {
            self.root / "results",
            self.root / "src" / "strategies",  # Code-driven: agent writes here
            Path("/tmp"),
        }

    def can_read(self, path: str) -> bool:
        resolved = Path(path).resolve()
        return any(
            resolved == allowed or resolved.is_relative_to(allowed)
            for allowed in self.readable | self.writable
        )

    def can_write(self, path: str) -> bool:
        resolved = Path(path).resolve()
        return any(
            resolved == allowed or resolved.is_relative_to(allowed)
            for allowed in self.writable
        )
```

### Audit Logging

Log all agent actions for post-hoc review and anomaly detection:

```python
# src/security/audit.py
import json
import logging
from datetime import datetime
from pathlib import Path

class AuditLogger:
    """Structured audit log for agent actions."""

    def __init__(self, log_path: str):
        self.log_path = Path(log_path)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.logger = logging.getLogger("audit")

    def log_action(self, action: str, details: dict) -> None:
        record = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            **details,
        }
        with open(self.log_path, "a") as f:
            f.write(json.dumps(record) + "\n")
        self.logger.info("AUDIT: %s -- %s", action, json.dumps(details))

    def log_file_write(self, path: str, size: int) -> None:
        self.log_action("file_write", {"path": path, "size_bytes": size})

    def log_process_run(self, command: list[str], exit_code: int) -> None:
        self.log_action("process_run", {
            "command": command[:5],  # Truncate for safety
            "exit_code": exit_code,
        })

    def log_credential_access(self, credential_name: str) -> None:
        self.log_action("credential_access", {"credential": credential_name})
```

### Security Checklist for Research Projects

1. All experiment runs use a sandbox (process limits or container).
2. Network access is disabled by default (enable only for API-driven experiments with explicit allowlist).
3. Credentials are injected via environment variables, never in config files or source code.
4. Agent-generated code is validated before running.
5. Filesystem writes are restricted to designated directories.
6. Resource limits are enforced at the OS level, not in application code.
7. All agent actions are audit-logged.
8. Results directory is treated as untrusted output (sanitize before display).
