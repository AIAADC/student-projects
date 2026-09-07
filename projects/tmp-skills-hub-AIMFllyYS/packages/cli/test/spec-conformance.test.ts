import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec conformance assertions (#169):
 * Guard hard rules that were previously enforced only by coincidence.
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

describe("spec conformance", () => {
  it("CLI subCommands match cli-commands-v0 command table", async () => {
    const specRaw = await readFile(path.join(ROOT, "docs", "specs", "cli-commands-v0.md"), "utf8");
    const specCommands = new Set<string>();
    for (const m of specRaw.matchAll(/^\|\s*`([a-z][a-z -]*?)`/gm)) {
      const cmd = m[1].split(" ")[0];
      specCommands.add(cmd);
    }

    const indexRaw = await readFile(path.join(ROOT, "packages", "cli", "src", "index.ts"), "utf8");
    const subCommandsMatch = indexRaw.match(/subCommands:\s*\{([^}]+)\}/);
    expect(subCommandsMatch).not.toBeNull();
    const codeCommands = new Set<string>();
    for (const m of subCommandsMatch![1].matchAll(/(\w+)/g)) {
      const name = m[1];
      if (name === "newCmd") codeCommands.add("new");
      else codeCommands.add(name);
    }

    for (const cmd of specCommands) {
      expect(codeCommands, `spec command "${cmd}" missing from code`).toContain(cmd);
    }
  });

  it("no recursive deletion of store skills directory in core", async () => {
    const coreDir = path.join(ROOT, "packages", "core", "src");
    const files = await readdir(coreDir);
    for (const f of files) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const content = await readFile(path.join(coreDir, f), "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.includes("rm(") &&
          line.includes("recursive") &&
          line.includes("skills")
        ) {
          throw new Error(
            `${f}:${i + 1} — found recursive rm on skills directory. ` +
              "No code path should recursively delete the store's skills/ directory.",
          );
        }
      }
    }
  });

  it("enable dry-run 走 previewLinkChange,不手建 LinkEntry[]", async () => {
    const src = await readFile(path.join(ROOT, "packages", "cli", "src", "store-cmds.ts"), "utf8");
    const start = src.indexOf("export async function runEnable");
    const end = src.indexOf("export async function runDisable");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fn = src.slice(start, end);
    expect(fn).toContain("previewLinkChange");
    expect(fn).not.toContain("satisfies LinkEntry");
    expect(fn).not.toContain("readLinksLedger");
  });

  it("self-skill is bundled in cli/self-skill/", async () => {
    const skillMd = path.join(ROOT, "packages", "cli", "self-skill", "SKILL.md");
    const content = await readFile(skillMd, "utf8");
    expect(content).toContain("name: skills-hub");
    expect(content).toContain("new");
  });
});
