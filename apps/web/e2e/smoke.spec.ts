import { expect, test } from "@playwright/test";

test("signed-out visitors land on login, cross-origin isolated, with a healthy stack", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle("Lumacut");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  // COOP/COEP are required for SharedArrayBuffer in the engine (M2).
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);

  await expect(page.getByText("All services are healthy.")).toBeVisible();
  for (const check of ["database", "queue", "storage", "worker"]) {
    await expect(page.locator(`[data-check="${check}"]`)).toContainText("OK");
  }
});

test("the API is reachable through the same-origin /api proxy", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
});
