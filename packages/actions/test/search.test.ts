import { describe, expect, it } from "vitest";
import { searchActions, tokenScore, type Action } from "../src/index.ts";

function action(
  id: string,
  title: string,
  keywords: string[],
  category = "Edit",
  description = "Does a thing for the user.",
): Action<null> {
  return { id, title, description, keywords, category, when: () => true, run: () => undefined };
}

const ACTIONS = [
  action(
    "clip.split",
    "Split clip at playhead",
    ["cut", "razor", "divide", "blade"],
    "Edit",
    "Cut the selected clip into two at the playhead.",
  ),
  action("clip.delete", "Delete clip", ["remove", "trash"], "Edit"),
  action("track.mute", "Mute track", ["silence", "volume off"], "Track"),
  action("project.rename", "Rename project", ["title"], "Project"),
  action("library.upload", "Upload media", ["import", "add"], "Library"),
];

const ids = (query: string, limit?: number) =>
  searchActions(ACTIONS, query, limit).map((h) => h.action.id);

describe("tokenScore", () => {
  it("ranks exact word > word prefix > substring > scattered letters > nothing", () => {
    const exact = tokenScore("split", "Split clip");
    const prefix = tokenScore("spl", "Split clip");
    const inside = tokenScore("lit", "Split clip");
    const scattered = tokenScore("splt", "Split clip");
    expect([exact, prefix, inside]).toEqual([100, 80, 60]);
    expect(scattered).toBeGreaterThan(0);
    expect(scattered).toBeLessThan(60);
    expect(tokenScore("xyz", "Split clip")).toBe(0);
  });

  it("ignores case and accents, and refuses empty or too-short fuzzy tokens", () => {
    expect(tokenScore("cafe", "Café")).toBe(100);
    expect(tokenScore("", "anything")).toBe(0);
    expect(tokenScore("sc", "Split clip")).toBe(0); // 2 letters scattered across words is noise
    expect(tokenScore("a", "")).toBe(0);
  });
});

describe("searchActions", () => {
  it("finds actions by synonym keywords", () => {
    expect(ids("razor")[0]).toBe("clip.split");
    expect(ids("trash")[0]).toBe("clip.delete");
    expect(ids("silence")[0]).toBe("track.mute");
  });

  it("finds by title words, prefixes and typos-ish scattered letters", () => {
    expect(ids("split")[0]).toBe("clip.split");
    expect(ids("ren")[0]).toBe("project.rename");
    expect(ids("splt")).toContain("clip.split");
  });

  it("requires every word to match", () => {
    expect(ids("delete clip")).toEqual(["clip.delete"]);
    expect(ids("delete banana")).toEqual([]);
  });

  it("weights title over keyword over description", () => {
    const list = [
      action("a.one", "Alpha", ["beta"]),
      action("b.two", "Beta", ["gamma"]),
      action("c.three", "Gamma", ["delta"], "Edit", "Mentions beta only here."),
    ];
    const ranked = searchActions(list, "beta").map((h) => h.action.id);
    expect(ranked).toEqual(["b.two", "a.one", "c.three"]);
  });

  it("matches category and id too", () => {
    expect(ids("library")).toEqual(["library.upload"]);
    expect(ids("clip.del")).toContain("clip.delete");
  });

  it("an empty query lists everything by category then title, and the limit applies", () => {
    expect(ids("")).toEqual([
      "clip.delete",
      "clip.split",
      "library.upload",
      "project.rename",
      "track.mute",
    ]);
    expect(ids("", 2)).toHaveLength(2);
    expect(ids("   ")).toHaveLength(5);
  });

  it("breaks ties by category then title", () => {
    const list = [
      action("z.b", "Same", ["same"], "Zeta"),
      action("a.b", "Same", ["same"], "Alpha"),
    ];
    expect(searchActions(list, "same").map((h) => h.action.id)).toEqual(["a.b", "z.b"]);
  });
});
