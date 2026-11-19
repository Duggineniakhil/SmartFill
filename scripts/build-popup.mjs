// Transpiles the extension pages' scripts (popup.tsx, tracker.ts) to .js.
// extension/tsconfig.json only compiles content/**, and the pages load their
// script as a classic <script>, so the trailing `export {}` (there only to make
// the source a module) is dropped.
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";

for (const [from, to] of [
  ["extension/popup/popup.tsx", "extension/popup/popup.js"],
  ["extension/tracker/tracker.ts", "extension/tracker/tracker.js"],
]) {
  const src = readFileSync(from, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  const js = outputText.replace(/^export \{\};\s*$/m, "").trimEnd() + "\n";
  writeFileSync(to, js);
  console.log(`wrote ${to}`);
}
