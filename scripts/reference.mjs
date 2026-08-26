#!/usr/bin/env node
// Writes the static reference pages, the sitemap and robots.txt from the very
// same tool descriptors registry.js hands the running page — see
// isa-toolkit's generate/reference.mjs for what comes out and why. Runs after
// vendor.mjs, since it reads a registry that imports vendored modules.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeReference } from "isa-toolkit/generate/reference.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docs = join(root, "docs");
const { TOOLS } = await import(new URL("../docs/registry.js", import.meta.url));

const written = writeReference({
  tools: TOOLS,
  outDir: docs,
  site: {
    name: "RISC-V Toolbox",
    short: "RISC-V",
    base: "https://romainmichau.github.io/riscv-toolbox/",
    root: "../", // every generated page sits one level down, in reference/
    tagline: "RISC-V RV32 encoding reference: every instruction format, register and opcode table, alongside a browser encoder and decoder.",
  },
});

console.log(`Wrote ${written.length} reference pages, a sitemap and robots.txt into docs/.`);
