/**
 * SPEC §13, M3 acceptance: "build a 5-clip edit only via the palette, then only via the mouse;
 * reload is identical".
 *
 * The same edit is built twice, in two projects, from the same uploaded 10 s video (picture and
 * linked sound):
 *   1. cut it at 2, 4, 6 and 8 s into five picture clips (each with its sound clip);
 *   2. move the last piece 2 s later, leaving a gap;
 *   3. shorten the first piece so it ends at 1.5 s.
 * Flow A uses only the command palette and the keyboard. Flow B uses only the mouse (clicks and
 * drags). Setup (upload, creating the project) is the same for both and is not part of the edit.
 * For each flow we read the clips back from the timeline, reload the page, and require the exact
 * same clips; then the two flows must have produced the same edit.
 */
import { expect, test, type Page } from "@playwright/test";
import { card, registerNewUser, sample } from "./helpers.ts";

test.describe.configure({ timeout: 420_000 });

const PX_PER_SECOND = 100; // the timeline's default zoom

interface ClipShape {
  /** 0 = top lane. */
  lane: number;
  startS: number;
  lengthS: number;
}

/** The clips as drawn on the timeline, independent of their ids. */
async function readClips(page: Page): Promise<ClipShape[]> {
  const shapes = await page.evaluate((pxPerSecond) => {
    const lanes = Array.from(document.querySelectorAll("[data-lane]"));
    return Array.from(document.querySelectorAll("[data-clip]")).map((el) => {
      const lane = lanes.indexOf(el.closest("[data-lane]") as Element);
      const style = (el as HTMLElement).style;
      return { lane, startS: parseFloat(style.left) / pxPerSecond, lengthS: parseFloat(style.width) / pxPerSecond };
    });
  }, PX_PER_SECOND);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return shapes
    .map((s) => ({ lane: s.lane, startS: round(s.startS), lengthS: round(s.lengthS) }))
    .sort((a, b) => a.lane - b.lane || a.startS - b.startS);
}

const savedStatus = (page: Page) => page.getByTestId("save-status");

async function waitSaved(page: Page): Promise<void> {
  await expect(savedStatus(page)).toHaveAttribute("data-state", "saved", { timeout: 30_000 });
}

/** Runs a palette command with the keyboard alone: open, type, Enter, fill the argument form, Enter. */
async function palette(page: Page, query: string, args: Record<string, string> = {}, expectForm = Object.keys(args).length > 0): Promise<void> {
  await page.keyboard.press("ControlOrMeta+K");
  const box = page.getByRole("combobox", { name: "Search commands" });
  await expect(box).toBeVisible();
  await page.keyboard.type(query);
  await page.keyboard.press("Enter");
  if (expectForm) {
    for (const [name, value] of Object.entries(args)) {
      await page.getByLabel(new RegExp(`^${name}`)).fill(value);
    }
    await page.keyboard.press("Enter");
  }
  await expect(box).toBeHidden();
}

async function newProject(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New project" }).click();
  await page.waitForURL(/\/project\//);
  await expect(page.getByTestId("track-header")).toHaveCount(2);
}

async function reloadAndRead(page: Page): Promise<ClipShape[]> {
  await waitSaved(page);
  await page.reload();
  await expect(page.locator("[data-clip]").first()).toBeVisible({ timeout: 30_000 });
  return readClips(page);
}

const EXPECTED_CLIP_COUNT = 10; // five pictures and their five sound clips

test("a 5-clip edit built only with the palette, then only with the mouse, is the same after a reload", async ({ page }) => {
  await registerNewUser(page);
  await page.getByTestId("upload-input").setInputFiles([sample("fn_1080p30.mp4")]);
  await expect(card(page, "fn_1080p30.mp4").getByTestId("asset-status")).toHaveText("Ready", { timeout: 240_000 });

  // --- A: palette and keyboard only --------------------------------------------------------------
  await newProject(page);
  await palette(page, "add media", { asset: "fn_1080p30" });
  await expect(page.locator("[data-clip]")).toHaveCount(2);
  for (const t of ["2", "4", "6", "8"]) {
    await palette(page, "go to time", { seconds: t });
    await palette(page, "split clip");
  }
  await expect(page.locator("[data-clip]")).toHaveCount(EXPECTED_CLIP_COUNT);

  await palette(page, "go to time", { seconds: "9" });
  await palette(page, "select clips at playhead", {}, true);
  await palette(page, "move clips by", { seconds: "2" });

  await palette(page, "go to time", { seconds: "0.5" });
  await palette(page, "select clips at playhead", {}, true);
  await palette(page, "trim end to", { seconds: "1.5" });

  await expect(page.locator("[data-clip]")).toHaveCount(EXPECTED_CLIP_COUNT);
  const builtByPalette = await readClips(page);
  const afterReloadA = await reloadAndRead(page);
  expect(afterReloadA).toEqual(builtByPalette);

  // --- B: mouse only -----------------------------------------------------------------------------
  await page.goto("/");
  await newProject(page);
  await page.getByRole("tab", { name: /add media/i }).click();
  await page.getByRole("button", { name: "Add fn_1080p30.mp4 at the playhead" }).click();
  await expect(page.locator("[data-clip]")).toHaveCount(2);

  const pictureLane = page.getByTestId("lane").nth(1); // rows are top-down: Audio 1, then Video 1
  await page.getByRole("button", { name: "Razor tool" }).click();
  for (const t of [2, 4, 6, 8]) {
    await pictureLane.click({ position: { x: t * PX_PER_SECOND, y: 20 } });
  }
  await expect(page.locator("[data-clip]")).toHaveCount(EXPECTED_CLIP_COUNT);
  await page.getByRole("button", { name: "Selection tool" }).click();

  const pictures = pictureLane.locator("[data-clip]");
  const last = await pictures.last().boundingBox();
  if (last === null) throw new Error("last clip has no box");
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width / 2 + 2 * PX_PER_SECOND, last.y + last.height / 2, { steps: 12 });
  await page.mouse.up();

  const first = await pictures.first().boundingBox();
  if (first === null) throw new Error("first clip has no box");
  await page.mouse.move(first.x + first.width - 3, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width - 3 - 0.5 * PX_PER_SECOND, first.y + first.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator("[data-clip]")).toHaveCount(EXPECTED_CLIP_COUNT);
  const builtByMouse = await readClips(page);
  const afterReloadB = await reloadAndRead(page);
  expect(afterReloadB).toEqual(builtByMouse);

  // --- The same edit either way, with the gap and the trim where they should be -----------------
  expect(builtByMouse).toEqual(builtByPalette);
  const pictureClips = builtByPalette.filter((c) => c.lane === 1);
  expect(pictureClips).toEqual([
    { lane: 1, startS: 0, lengthS: 1.5 },
    { lane: 1, startS: 2, lengthS: 2 },
    { lane: 1, startS: 4, lengthS: 2 },
    { lane: 1, startS: 6, lengthS: 2 },
    { lane: 1, startS: 10, lengthS: 2 },
  ]);
});

test("a clip's properties are edited in the inspector, undo in one step, and survive a reload", async ({ page }) => {
  await registerNewUser(page);
  await page.getByTestId("upload-input").setInputFiles([sample("fn_1080p30.mp4")]);
  await expect(card(page, "fn_1080p30.mp4").getByTestId("asset-status")).toHaveText("Ready", { timeout: 240_000 });
  await newProject(page);
  await page.getByRole("tab", { name: /add media/i }).click();
  await page.getByRole("button", { name: "Add fn_1080p30.mp4 at the playhead" }).click();
  await page.getByRole("tab", { name: /inspector/i }).click();

  await page.getByTestId("lane").nth(1).locator("[data-clip]").first().click(); // select the picture clip
  await expect(page.getByTestId("inspector-title")).toContainText("fn_1080p30.mp4");

  const opacity = page.getByRole("textbox", { name: "Opacity" });
  await opacity.fill("40");
  await opacity.press("Enter");
  await expect(opacity).toHaveValue("40");
  const scale = page.getByRole("textbox", { name: "Scale" });
  await scale.fill("*0.5");
  await scale.press("Enter");
  await expect(scale).toHaveValue("50");

  await waitSaved(page);
  await page.reload();
  await page.getByTestId("lane").nth(1).locator("[data-clip]").first().click();
  await expect(page.getByRole("textbox", { name: "Opacity" })).toHaveValue("40");
  await expect(page.getByRole("textbox", { name: "Scale" })).toHaveValue("50");

  // Undo is one step per edit (history isn't kept across a reload, so edit again first).
  const again = page.getByRole("textbox", { name: "Opacity" });
  await again.fill("+10");
  await again.press("Enter");
  await expect(again).toHaveValue("50");
  await again.blur();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("textbox", { name: "Opacity" })).toHaveValue("40");
});

test("copy and paste, and the right-click menu, work on clips", async ({ page }) => {
  await registerNewUser(page);
  await page.getByTestId("upload-input").setInputFiles([sample("fn_1080p30.mp4")]);
  await expect(card(page, "fn_1080p30.mp4").getByTestId("asset-status")).toHaveText("Ready", { timeout: 240_000 });
  await newProject(page);
  await page.getByRole("tab", { name: /add media/i }).click();
  await page.getByRole("button", { name: "Add fn_1080p30.mp4 at the playhead" }).click();
  await expect(page.locator("[data-clip]")).toHaveCount(2);

  const clip = page.getByTestId("lane").nth(1).locator("[data-clip]").first();
  await clip.click();
  await page.keyboard.press("ControlOrMeta+c");
  await palette(page, "go to time", { seconds: "12" });
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.locator("[data-clip]")).toHaveCount(4);

  await page.getByTestId("lane").nth(1).locator("[data-clip]").last().click({ button: "right" });
  await page.getByRole("menuitem", { name: /Delete clip/ }).click();
  await expect(page.locator("[data-clip]")).toHaveCount(2);
});
