// Transpiles the extension's non-content scripts (popup, tracker page,
// background worker) to .js, and copies pdf.js into extension/vendor/ for CV
// uploads. extension/tsconfig.json only compiles content/**. The pages and the
// worker load their script as a classic script, so the trailing `export {}`
// (there only to make a source file a module) is dropped.
import ts from "typescript";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

for (const [from, to] of [
  ["extension/popup/popup.tsx", "extension/popup/popup.js"],
  ["extension/tracker/tracker.ts", "extension/tracker/tracker.js"],
  ["extension/background/background.ts", "extension/background/background.js"],
  ["extension/background/ai.ts", "extension/background/ai.js"],
]) {
  const src = readFileSync(from, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  const js = outputText.replace(/^export \{\};\s*$/m, "").trimEnd() + "\n";
  writeFileSync(to, js);
  console.log(`wrote ${to}`);
}

// pdf.js (Apache-2.0) reads uploaded PDF CVs inside the tracker page.
mkdirSync("extension/vendor/pdfjs", { recursive: true });
for (const file of ["build/pdf.min.mjs", "build/pdf.worker.min.mjs", "LICENSE"]) {
  const name = file.split("/").pop();
  copyFileSync(`node_modules/pdfjs-dist/${file}`, `extension/vendor/pdfjs/${name}`);
}
console.log("copied pdf.js to extension/vendor/pdfjs");
