import fs from "fs";
import path from "path";

const panelRe =
  /className="flex max-h-\[92vh\] w-full max-w-/g;
const backdropRe =
  /className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950\/65 p-3 backdrop-blur-sm sm:p-6"/g;

function walk(dir) {
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      if (!["node_modules", "dist"].includes(file)) walk(full);
    } else if (file.endsWith(".tsx")) {
      let text = fs.readFileSync(full, "utf8");
      const original = text;
      if (!text.includes("legacy-modal-panel")) {
        text = text.replace(panelRe, 'className="legacy-modal-panel flex max-h-[92vh] w-full max-w-');
      }
      text = text.replace(backdropRe, 'className="legacy-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6"');
      if (text !== original) {
        fs.writeFileSync(full, text);
        console.log("tagged", full.replace(process.cwd() + path.sep, ""));
      }
    }
  }
}

walk("src");
