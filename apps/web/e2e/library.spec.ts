import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { card, imageLoaded, registerNewUser, sample } from "./helpers.ts";

test.describe.configure({ timeout: 300_000 });

test("upload a video and an image; both show thumbnails, waveform and duration", async ({
  page,
}) => {
  await registerNewUser(page);
  await page
    .getByTestId("upload-input")
    .setInputFiles([sample("fn_1080p30.mp4"), sample("img_6000x4000.jpg")]);

  const video = card(page, "fn_1080p30.mp4");
  const photo = card(page, "img_6000x4000.jpg");
  // Status changes arrive over SSE: Uploading → Queued → Processing … → Ready.
  await expect(video.getByTestId("asset-status")).toHaveText("Ready", { timeout: 240_000 });
  await expect(photo.getByTestId("asset-status")).toHaveText("Ready", { timeout: 120_000 });

  await expect(video.getByTestId("asset-duration")).toHaveText("0:10");
  await expect(video.getByTestId("asset-resolution")).toHaveText("1920×1080");
  await expect(video.getByTestId("poster")).toBeVisible();
  await expect
    .poll(() =>
      imageLoaded(
        page,
        '[data-testid="asset-card"]:has-text("fn_1080p30.mp4") [data-testid="poster"]',
      ),
    )
    .toBe(true);
  await expect(video.getByTestId("waveform")).toBeVisible();

  // Hover scrubs through the thumbnail sprite.
  await video.getByTestId("poster").hover({ position: { x: 150, y: 40 } });
  await expect(video.getByTestId("sprite")).toBeVisible();
  await expect.poll(() => imageLoaded(page, '[data-testid="sprite"]')).toBe(true);

  await expect(photo.getByTestId("asset-resolution")).toHaveText("6000×4000");
  await expect
    .poll(() =>
      imageLoaded(
        page,
        '[data-testid="asset-card"]:has-text("img_6000x4000.jpg") [data-testid="poster"]',
      ),
    )
    .toBe(true);

  // Search (server-side) via the "/" shortcut.
  await page.locator("body").press("/");
  await expect(page.getByRole("searchbox", { name: "Search library" })).toBeFocused();
  await page.keyboard.type("fn_1080");
  await expect(page.getByTestId("asset-card")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search library" }).fill("");
  await expect(page.getByTestId("asset-card")).toHaveCount(2);

  // List view.
  await page.getByRole("button", { name: "Switch grid / list view" }).click();
  await expect(page.getByTestId("asset-row")).toHaveCount(2);
  await expect(page.getByTestId("asset-row").filter({ hasText: "fn_1080p30.mp4" })).toContainText(
    "0:10",
  );
  await page.getByRole("button", { name: "Switch grid / list view" }).click();

  // Delete with confirmation.
  await photo.getByRole("button", { name: "Delete asset" }).click();
  await expect(page.getByRole("dialog")).toContainText("Delete “img_6000x4000.jpg”?");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("asset-card")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("asset-card")).toHaveCount(1);
});

test("a damaged file fails with a clear message and can be retried", async ({ page }) => {
  await registerNewUser(page);
  const data = readFileSync(sample("fn_1080p30.mp4"));
  await page.getByTestId("upload-input").setInputFiles({
    name: "broken.mp4",
    mimeType: "video/mp4",
    buffer: data.subarray(0, Math.floor(data.length * 0.4)),
  });
  const broken = card(page, "broken.mp4");
  await expect(broken.getByTestId("asset-status")).toHaveText("Failed", { timeout: 180_000 });
  await expect(broken.getByRole("alert")).toContainText("The file is damaged or incomplete");

  await broken.getByRole("button", { name: "Retry processing" }).click();
  await expect(broken.getByTestId("asset-status")).not.toHaveText("Failed");
  await expect(broken.getByTestId("asset-status")).toHaveText("Failed", { timeout: 180_000 });
});
