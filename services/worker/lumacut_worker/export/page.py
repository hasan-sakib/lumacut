"""Drives the render page in headless Chromium (Playwright) for one export."""

from __future__ import annotations

from typing import Any

from playwright.sync_api import sync_playwright

#: Chromium switches for a container without a GPU: WebGL through SwiftShader (CPU), the same
#: backend the engine's cross-backend tests compare against.
CHROMIUM_ARGS = [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
]


def run_page_export(url: str, job: dict[str, Any]) -> dict[str, Any]:
    """Opens the render page at `url` and runs `window.__lumacut.runExport(job)`.

    Returns the page's report (size, frame count, warnings). The page POSTs frames and audio to
    the job's server while this call waits; a cancelled export makes the page throw.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
        try:
            page = browser.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url, wait_until="load")
            page.wait_for_function("() => window.__lumacut !== undefined", timeout=60_000)
            page.set_default_timeout(0)  # an export takes as long as it takes
            report: dict[str, Any] = page.evaluate("job => window.__lumacut.runExport(job)", job)
            if errors:
                report.setdefault("warnings", []).extend(errors)
            return report
        finally:
            browser.close()
