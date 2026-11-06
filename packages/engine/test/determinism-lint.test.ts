import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { determinismRules } from "../../../eslint.determinism.ts";

const root = new URL("../../../", import.meta.url).pathname;

/** Lints a snippet with just the determinism rules (no type information needed). */
async function messages(code: string): Promise<string[]> {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser }, rules: determinismRules },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: `${root}snippet.ts` });
  return (result?.messages ?? []).map((m) => m.message);
}

describe("determinism lint rule", () => {
  it.each([
    "const t = Date.now();",
    "const r = Math.random();",
    "const n = performance.now();",
    "const d = new Date();",
    "const s = Date();",
    "const id = crypto.randomUUID();",
    "crypto.getRandomValues(new Uint8Array(4));",
  ])("forbids %s", async (code) => {
    const found = await messages(code);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("deterministic");
  });

  it.each([
    "const d = new Date(0);",
    "const d = new Date('2026-11-01T00:00:00Z');",
    "const x = Math.floor(2.5) + Math.max(1, 2);",
    "const run = (clock: { nowMs(): number }) => clock.nowMs();",
  ])("allows %s", async (code) => {
    expect(await messages(code)).toEqual([]);
  });

  it("still forbids default exports in the same files", async () => {
    expect((await messages("export default 1;"))[0]).toContain("named exports");
  });

  it("is active for render code and off for the clock, tests and test tooling", async () => {
    const eslint = new ESLint({ cwd: root });
    const active = async (file: string): Promise<boolean> => {
      const config = (await eslint.calculateConfigForFile(`${root}${file}`)) as {
        rules?: Record<string, unknown>;
      };
      const rule = config.rules?.["no-restricted-properties"] as unknown[] | undefined;
      return rule !== undefined && JSON.stringify(rule).includes("Math");
    };
    for (const file of [
      "packages/engine/src/render/engine.ts",
      "packages/engine/src/decode/frame-reader.ts",
      "packages/engine/src/gl/compositor.ts",
      "packages/engine/src/timeline/source-time.ts",
      "packages/engine/src/math/matrix.ts",
      "packages/engine/src/blend/reference.ts",
    ]) {
      expect(await active(file), file).toBe(true);
    }
    for (const file of [
      "packages/engine/src/clock.ts",
      "packages/engine/src/testing/ssim.ts",
      "packages/engine/browser-test/helpers.ts",
      "services/../apps/web/src/main.tsx",
    ]) {
      expect(await active(file), file).toBe(false);
    }
  });
});
