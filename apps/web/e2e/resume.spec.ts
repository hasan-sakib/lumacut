import { expect, test, type Request, type Route } from "@playwright/test";
import { card, registerNewUser, sample } from "./helpers.ts";

test.describe.configure({ timeout: 300_000 });

const isPart = (n: number) => (url: URL) =>
  url.searchParams.get("partNumber") === String(n) && url.searchParams.has("uploadId");

test("an upload interrupted by a page refresh resumes and sends only the missing part", async ({
  page,
}) => {
  await registerNewUser(page);

  // 22 MB file = 2 parts of 16 MiB. Let part 1 through, hold part 2 forever.
  const held: Route[] = [];
  const holdPart2 = isPart(2); // unroute() matches the same function reference
  await page.route(holdPart2, (route) => {
    held.push(route);
  });
  const part1Done = page.waitForEvent("requestfinished", (r: Request) =>
    isPart(1)(new URL(r.url())),
  );
  await page.getByTestId("upload-input").setInputFiles(sample("long_gop_1080p30.mp4"));
  await part1Done;
  await expect.poll(() => held.length).toBe(1);

  // Refresh mid-upload: the File object is gone; storage still has part 1.
  await page.unroute(holdPart2);
  await page.reload();
  const asset = card(page, "long_gop_1080p30.mp4");
  await expect(asset.getByTestId("asset-status")).toHaveText("Upload paused");

  const partPuts: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (r.method() === "PUT" && url.searchParams.has("partNumber"))
      partPuts.push(url.searchParams.get("partNumber") ?? "");
  });
  const chooser = page.waitForEvent("filechooser");
  await asset.getByRole("button", { name: "Resume upload" }).click();
  await (await chooser).setFiles(sample("long_gop_1080p30.mp4"));

  await expect(asset.getByTestId("asset-status")).toHaveText("Ready", { timeout: 240_000 });
  expect(partPuts).toEqual(["2"]);
});
