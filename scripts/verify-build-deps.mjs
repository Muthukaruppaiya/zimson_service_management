import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const required = ["qrcode", "react", "react-dom", "vite"];

for (const name of required) {
  try {
    require.resolve(name);
  } catch {
    console.error(`\nMissing npm package "${name}". On the server run:\n`);
    console.error("  cd ~/zimson_service_management");
    console.error("  git pull");
    console.error("  rm -rf node_modules");
    console.error("  npm ci");
    console.error("  npm run build\n");
    process.exit(1);
  }
}

console.log("Build dependencies OK.");
