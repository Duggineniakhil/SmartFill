// Transpiles extension/popup/popup.tsx -> popup.js. extension/tsconfig.json only
// compiles content/**, and popup.html loads popup.js as a classic script, so
// the trailing `export {}` (there only to make the .tsx a module) is dropped.
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("extension/popup/popup.tsx", "utf8");
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const js = outputText.replace(/^export \{\};\s*$/m, "").trimEnd() + "\n";
writeFileSync("extension/popup/popup.js", js);
console.log("wrote extension/popup/popup.js");
