import { expect, test, type Page } from "@playwright/test";
import { card, registerNewUser, sample } from "./helpers.ts";

test.describe.configure({ timeout: 300_000 });

const frameNumber = async (page: Page): Promise<number> => {
  const text = (await page.getByTestId("frame-number").textContent()) ?? "";
  return Number(/frame (\d+) \//.exec(text)?.[1]);
};

const barcode = async (page: Page): Promise<string> =>
  (await page.getByTestId("hud-barcode").textContent()) ?? "";

test("the player bench plays, steps and scrubs a real uploaded video frame-exactly", async ({
  page,
}) => {
  await registerNewUser(page);
  await page.getByTestId("upload-input").setInputFiles([sample("fn_1080p30.mp4")]);
  await expect(card(page, "fn_1080p30.mp4").getByTestId("asset-status")).toHaveText("Ready", {
    timeout: 240_000,
  });

  await page.goto("/dev/player");
  await expect(page.getByRole("heading", { name: "Player bench" })).toBeVisible();
  await page.getByRole("button", { name: "Add fn_1080p30.mp4 as a layer" }).click();

  // The first frame is on screen and its barcode (frame 0) is read back through the engine.
  await expect(page.getByTestId("hud-barcode")).toHaveText("0", { timeout: 60_000 });
  await expect(page.getByTestId("frame-number")).toContainText("frame 0 / 299");

  // Stepping one frame at a time shows exactly that frame.
  for (let n = 1; n <= 5; n += 1) {
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("frame-number")).toContainText(`frame ${String(n)} /`);
    await expect(page.getByTestId("hud-barcode")).toHaveText(String(n));
  }
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("hud-barcode")).toHaveText("4");

  // Scrubbing anywhere lands exactly.
  const scrub = page.getByRole("slider", { name: "Scrub" });
  for (const target of [200, 37, 299, 150]) {
    await scrub.fill(String(target));
    await expect(page.getByTestId("hud-barcode")).toHaveText(String(target));
  }

  // Playing advances the playhead in real time; pausing freezes it on a frame whose barcode matches.
  await page.keyboard.press("Home");
  await expect(page.getByTestId("hud-barcode")).toHaveText("0");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("play-state")).toHaveText("Playing");
  await page.waitForTimeout(2500);
  await expect.poll(() => frameNumber(page)).toBeGreaterThan(40);
  const fps = Number(await page.getByTestId("hud-fps").textContent());
  // Headless Chromium renders WebGL on the CPU (SwiftShader), so this only proves frames flow;
  // the real frame-rate gate is `make perf` on the GPU.
  expect(fps).toBeGreaterThan(2);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("play-state")).toHaveText("Paused");
  const stoppedAt = await frameNumber(page);
  await expect.poll(() => barcode(page)).toBe(String(stoppedAt));
  await page.waitForTimeout(500);
  expect(await frameNumber(page)).toBe(stoppedAt);

  // Nothing leaked: every decoded frame has been closed.
  await expect(page.getByTestId("hud-open-frames")).toHaveText(/^0 /);
});

test("changing a layer's blend mode and opacity is reflected without errors", async ({ page }) => {
  await registerNewUser(page);
  await page.getByTestId("upload-input").setInputFiles([sample("fn_1080p30.mp4")]);
  await expect(card(page, "fn_1080p30.mp4").getByTestId("asset-status")).toHaveText("Ready", {
    timeout: 240_000,
  });
  await page.goto("/dev/player");
  await page.getByRole("button", { name: "Add fn_1080p30.mp4 as a layer" }).click();
  await expect(page.getByTestId("hud-barcode")).toHaveText("0", { timeout: 60_000 });

  await page.getByRole("combobox", { name: "Blend mode" }).selectOption("multiply");
  await page.getByRole("slider", { name: "Opacity" }).fill("0.5");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Nothing was skipped on the last frame.")).toBeVisible();

  // Shrinking the layer moves the barcode out of the readable position: the readout goes blank.
  await page.getByRole("slider", { name: "Scale" }).fill("0.5");
  await expect(page.getByTestId("hud-barcode")).toHaveText("—");
});
