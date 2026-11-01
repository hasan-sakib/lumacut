import { expect, test } from "@playwright/test";

test("the shell loads cross-origin isolated and every backend check is OK", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Lumacut");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lumacut");

  // COOP/COEP are required for SharedArrayBuffer in the engine (M2).
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  await expect(page.getByTestId("isolation")).toHaveText("Cross-origin isolated: yes");

  await expect(page.getByRole("status")).toHaveText("All services are healthy.");
  for (const check of ["database", "queue", "storage", "worker"]) {
    await expect(page.locator(`[data-check="${check}"]`)).toContainText("OK");
  }
});

test("the API is reachable through the same-origin /api proxy", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
});
