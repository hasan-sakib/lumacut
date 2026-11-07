import { expect, test, type Page } from "@playwright/test";
import { registerNewUser } from "./helpers.ts";

test.describe.configure({ timeout: 120_000 });

const status = (page: Page) => page.getByTestId("save-status");
const tracks = (page: Page) => page.getByTestId("track-header");

async function runFromPalette(page: Page, query: string): Promise<void> {
  await page.keyboard.press("ControlOrMeta+K");
  const box = page.getByRole("combobox", { name: "Search commands" });
  await expect(box).toBeVisible();
  await box.fill(query);
  await box.press("Enter");
}

async function newProject(page: Page): Promise<string> {
  await registerNewUser(page);
  await page.getByRole("button", { name: "New project" }).click();
  await page.waitForURL(/\/project\//);
  await expect(page.getByTestId("project-name")).toHaveText("Untitled project");
  return page.url();
}

test("a command from the palette edits the project, autosaves, survives a reload and can be undone", async ({
  page,
}) => {
  await newProject(page);
  await expect(tracks(page)).toHaveCount(2); // Video 1, Audio 1

  await runFromPalette(page, "video track");
  await expect(page.getByRole("combobox", { name: "Search commands" })).toBeHidden();
  await expect(tracks(page)).toHaveCount(3);
  await page.getByRole("tab", { name: /history/i }).click();
  await expect(page.getByTestId("history")).toContainText("Add video track");

  // Autosave: unsaved first, then saved.
  await expect(status(page)).not.toHaveAttribute("data-state", "saved");
  await expect(status(page)).toHaveAttribute("data-state", "saved", { timeout: 20_000 });

  // Undo and redo (the history isn't kept across a reload, so this comes before it).
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(tracks(page)).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect(tracks(page)).toHaveCount(3);
  await expect(status(page)).toHaveAttribute("data-state", "saved", { timeout: 20_000 });

  await page.reload();
  await expect(tracks(page)).toHaveCount(3);
  await expect(page.getByText("Video 2")).toBeVisible();
});

test("a command that takes arguments asks for them in the palette", async ({ page }) => {
  await newProject(page);
  await runFromPalette(page, "marker");
  await page.getByLabel(/label/).fill("Intro");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator("[data-marker]")).toHaveCount(1);
});

test("the shortcut list and the right-click menu come from the same actions", async ({ page }) => {
  await newProject(page);
  await page.keyboard.press("Shift+?");
  await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible();
  await expect(page.getByText("Split clip at playhead")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByTestId("lane")
    .first()
    .click({ button: "right", position: { x: 5, y: 5 } });
  await expect(page.getByRole("menuitem", { name: /Add video track/ })).toBeVisible();
});

test("editing in two tabs: the second save is refused and the user chooses", async ({
  page,
  context,
}) => {
  const url = await newProject(page);
  const other = await context.newPage();
  await other.goto(url);
  await expect(tracks(other)).toHaveCount(2);
  await runFromPalette(other, "video track");
  await expect(status(other)).toHaveAttribute("data-state", "saved", { timeout: 20_000 });

  await runFromPalette(page, "audio track");
  await expect(page.getByRole("alert").filter({ hasText: "changed somewhere else" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(status(page)).toHaveAttribute("data-state", "conflict");

  await page.getByRole("button", { name: "Load the other version" }).click();
  await expect(tracks(page)).toHaveCount(3);
  await expect(page.getByText("Audio 2")).toHaveCount(0);
  await expect(status(page)).toHaveAttribute("data-state", "saved");
});
