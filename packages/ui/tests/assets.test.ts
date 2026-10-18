import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyAssets } from "../scripts/verify-assets.mjs";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

async function fixture(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "between-ui-assets-"));
  roots.push(root);
  const runtime = path.join(root, "src/materials/runtime");
  const items = [];
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(runtime, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
    items.push({ path: name, sha256: createHash("sha256").update(content).digest("hex") });
  }
  await fs.writeFile(path.join(root, "design-assets.json"), JSON.stringify({ schemaVersion: 1, root: "src/materials/runtime", files: items }));
  return { root, runtime };
}

describe("shared runtime distribution checks", () => {
  it("checks a complete local CSS, module and font dependency tree without executing it", async () => {
    const f = await fixture({
      "entry.css": "@import './nested.css'; @font-face{src:url('font.woff2')}",
      "nested.css": ".surface{color:#fff}",
      "font.woff2": "font-bytes",
      "entry.js": "import { value } from './value.js'; throw new Error('Must not execute');",
      "value.js": "export const value = 1;",
    });
    expect(await verifyAssets({ packageRoot: f.root })).toMatchObject({ files: 5, references: 3 });
  });

  it("rejects modified bytes even when the file path still exists", async () => {
    const f = await fixture({ "surface.css": ".surface{}" });
    await fs.writeFile(path.join(f.runtime, "surface.css"), ".surface{opacity:0}");
    await expect(verifyAssets({ packageRoot: f.root })).rejects.toThrow("Design asset mismatch");
  });

  it("rejects unlisted demo files rather than silently publishing a partial manifest", async () => {
    const f = await fixture({ "surface.css": ".surface{}" });
    await fs.writeFile(path.join(f.runtime, "demo.html"), "<p>Temporary data</p>");
    await expect(verifyAssets({ packageRoot: f.root })).rejects.toThrow("missing from the manifest");
  });

  it("rejects missing local dependencies even when the importing file hash is correct", async () => {
    const f = await fixture({ "surface.css": ".surface{background:url('missing.png')}" });
    await expect(verifyAssets({ packageRoot: f.root })).rejects.toThrow("Missing runtime reference");
  });

  it("rejects references that escape the shared runtime root", async () => {
    const f = await fixture({ "surface.css": "@import '../outside.css';" });
    await expect(verifyAssets({ packageRoot: f.root })).rejects.toThrow("escapes assets");
  });

  it("rejects symlinked resources without reading an outside target", async () => {
    const f = await fixture({ "surface.css": ".surface{}" });
    await fs.symlink(path.join(f.root, "missing-outside-target"), path.join(f.runtime, "link.css"));
    await expect(verifyAssets({ packageRoot: f.root })).rejects.toThrow("cannot be symbolic links");
  });
});
