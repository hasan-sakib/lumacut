import asyncio

from lumacut_api.health import run_checks


async def ok() -> None:
    return None


async def broken() -> None:
    raise ConnectionError("connection refused")


async def hangs() -> None:
    await asyncio.sleep(10)


async def test_all_ok() -> None:
    report = await run_checks({"a": ok, "b": ok}, timeout_s=1)
    assert report.status == "ok"
    assert {name: r.status for name, r in report.checks.items()} == {"a": "ok", "b": "ok"}


async def test_failure_is_reported_with_detail_and_does_not_hide_others() -> None:
    report = await run_checks({"db": broken, "queue": ok}, timeout_s=1)
    assert report.status == "degraded"
    assert report.checks["db"].status == "error"
    assert report.checks["db"].detail == "ConnectionError: connection refused"
    assert report.checks["queue"].status == "ok"


async def test_timeout_is_an_error() -> None:
    report = await run_checks({"slow": hangs}, timeout_s=0.05)
    assert report.status == "degraded"
    assert report.checks["slow"].detail == "timed out after 0.05s"


async def test_checks_run_concurrently() -> None:
    async def slow_ok() -> None:
        await asyncio.sleep(0.1)

    loop = asyncio.get_running_loop()
    start = loop.time()
    await run_checks({f"c{i}": slow_ok for i in range(5)}, timeout_s=1)
    assert loop.time() - start < 0.3
