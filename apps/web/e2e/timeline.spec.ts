import { expect, test, type Page } from "@playwright/test";
import { card, registerNewUser, sample } from "./helpers.ts";

test.describe.configure({ timeout: 300_000 });

const clips = (page: Page) => page.locator("[data-clip]");
const clipLeft = async (page: Page, index: number): Promise<number> => (await clips(page).nth(index).boundingBox())?.x ?? Number.NaN;

async function projectWithVideo(page: Page): Promise<void> {
  await registerNewUser(page);
  await page.getByTestId("upload-input").setInputFiles([sample("fn_1080p30.mp4")]);
  await expect(card(page, "fn_1080p30.mp4").getByTestId("asset-status")).toHaveText("Ready", { timeout: 240_000 });
  await page.getByRole("button", { name: "New project" }).click();
  await page.waitForURL(/\/project\//);
  await page.getByRole("button", { name: "Add fn_1080p30.mp4 at the playhead" }).click();
  await expect(clips(page)).toHaveCount(2); // the picture and its linked sound
}

test("the timeline edits with the mouse and the keyboard, and every edit undoes", async ({ page }) => {
  await projectWithVideo(page);

  // Cut at 2 s: both linked clips are cut and the halves stay linked.
  await page.getByTestId("ruler").click({ position: { x: 200, y: 10 } });
  await expect(page.getByTestId("timecode")).toHaveText("00:00:02:00");
  await page.keyboard.press("s");
  await expect(clips(page)).toHaveCount(4);

  // Drag the second half of the picture 150 px (1.5 s) to the right.
  const before = await clipLeft(page, 2);
  const box = await clips(page).nth(2).boundingBox();
  if (box === null) throw new Error("clip has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => clipLeft(page, 2)).toBeGreaterThan(before + 100);

  // Undo the move, then the cut.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => clipLeft(page, 2)).toBeCloseTo(before, -1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(clips(page)).toHaveCount(2);
});

test("tools switch with their keys and the razor cuts where you click", async ({ page }) => {
  await projectWithVideo(page);
  await page.keyboard.press("c");
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-tool", "razor");
  const box = await clips(page).first().boundingBox();
  if (box === null) throw new Error("clip has no box");
  await page.mouse.click(box.x + 300, box.y + box.height / 2);
  await expect(clips(page)).toHaveCount(4);
  await page.keyboard.press("v");
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-tool", "select");
});

test("Space plays the preview and the playhead follows", async ({ page }) => {
  await projectWithVideo(page);
  await expect(page.getByTestId("timecode")).toHaveText("00:00:00:00");
  await page.keyboard.press("Space");
  await expect.poll(async () => (await page.getByTestId("timecode").textContent()) ?? "", { timeout: 15_000 }).not.toBe("00:00:00:00");
  await page.keyboard.press("Space");
  const stopped = await page.getByTestId("timecode").textContent();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("timecode")).toHaveText(stopped ?? "");
});

test("a header switch mutes a track and zoom changes the clip width", async ({ page }) => {
  await projectWithVideo(page);
  const header = page.locator('[data-testid="track-header"]').first();
  await header.getByRole("button", { name: "Mute / unmute track" }).click();
  await expect(header.getByRole("button", { name: "Mute / unmute track" })).toHaveAttribute("aria-pressed", "true");
  const width = (await clips(page).first().boundingBox())?.width ?? 0;
  await page.keyboard.press("=");
  await expect.poll(async () => (await clips(page).first().boundingBox())?.width ?? 0).toBeGreaterThan(width * 1.3);
});
