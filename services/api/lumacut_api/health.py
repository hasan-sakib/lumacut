"""Readiness checks for the services the API depends on."""

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from typing import Literal

from pydantic import BaseModel

type HealthCheck = Callable[[], Awaitable[None]]
"""Raises (or times out) when the dependency is unavailable; returns None when healthy."""


class CheckResult(BaseModel):
    status: Literal["ok", "error"]
    detail: str | None = None


class HealthReport(BaseModel):
    status: Literal["ok", "degraded"]
    checks: dict[str, CheckResult]


async def _run_one(check: HealthCheck, timeout_s: float) -> CheckResult:
    try:
        await asyncio.wait_for(check(), timeout=timeout_s)
    except TimeoutError:
        return CheckResult(status="error", detail=f"timed out after {timeout_s:g}s")
    except Exception as exc:
        return CheckResult(status="error", detail=f"{type(exc).__name__}: {exc}")
    return CheckResult(status="ok")


async def run_checks(checks: Mapping[str, HealthCheck], timeout_s: float) -> HealthReport:
    """Run every check concurrently; one failure never hides the others."""
    names = list(checks)
    results = await asyncio.gather(*(_run_one(checks[n], timeout_s) for n in names))
    by_name = dict(zip(names, results, strict=True))
    healthy = all(r.status == "ok" for r in results)
    return HealthReport(status="ok" if healthy else "degraded", checks=by_name)
