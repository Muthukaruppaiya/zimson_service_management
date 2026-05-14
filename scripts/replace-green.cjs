const fs = require("fs");
const path = require("path");

function getAllFiles(dir, ext) {
  const results = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) results.push(...getAllFiles(full, ext));
    else if (ext.some((e) => f.endsWith(e))) results.push(full);
  }
  return results;
}

const srcDir = path.join(__dirname, "..", "src");
const files = getAllFiles(srcDir, [".tsx", ".ts", ".jsx", ".js"]);

const map = [
  ["bg-green-600", "bg-rlx-green"],
  ["bg-green-700", "bg-rlx-green-deep"],
  ["hover:bg-green-700", "hover:bg-rlx-green-deep"],
  ["hover:bg-green-600", "hover:bg-rlx-green"],
  ["bg-green-50", "bg-blue-50"],
  ["hover:bg-green-50", "hover:bg-blue-50"],
  ["border-green-200", "border-blue-200"],
  ["border-green-300", "border-blue-300"],
  ["border-green-400", "border-blue-400"],
  ["text-green-800", "text-blue-800"],
  ["text-green-700", "text-blue-700"],
  ["text-green-600", "text-blue-700"],
  ["text-green-300", "text-blue-300"],
  ["text-green-200", "text-blue-200"],
];

let total = 0;
for (const f of files) {
  let src = fs.readFileSync(f, "utf8");
  let changed = false;
  for (const [from, to] of map) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "g");
    const next = src.replace(rx, to);
    if (next !== src) { src = next; changed = true; }
  }
  if (changed) { fs.writeFileSync(f, src); total++; console.log("✓", path.relative(srcDir, f)); }
}
console.log("\nDone:", total, "files updated.");
