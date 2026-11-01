import { expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

export const SAMPLES = fileURLToPath(new URL("../../../samples/generated/", import.meta.url));

export function sample(name: string): string {
  return `${SAMPLES}${name}`;
}

/** Registers a fresh account through the UI and lands on the empty library. */
export async function registerNewUser(page: Page): Promise<string> {
  const email = `e2e-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Your library is empty.")).toBeVisible();
  return email;
}

export function card(page: Page, name: string) {
  return page.getByTestId("asset-card").filter({ hasText: name });
}

/** True once an <img> inside the locator has decoded (proves CORS + COEP allow it). */
export async function imageLoaded(page: Page, selector: string): Promise<boolean> {
  return page
    .locator(selector)
    .first()
    .evaluate((img) => {
      const el = img as HTMLImageElement;
      return el.complete && el.naturalWidth > 0;
    });
}
