/**
 * Vite 8 / Rolldown needs a platform-specific native package.
 * npm optional-deps sometimes skip it if node_modules was copied from another OS.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const BINDINGS = {
  arm64: "@rolldown/binding-linux-arm64-gnu",
  x64: "@rolldown/binding-linux-x64-gnu",
  win32: "@rolldown/binding-win32-x64-msvc",
  darwin_arm64: "@rolldown/binding-darwin-arm64",
  darwin_x64: "@rolldown/binding-darwin-x64",
};

function pkgForPlatform() {
  const { platform, arch } = process;
  if (platform === "linux" && arch === "arm64") return BINDINGS.arm64;
  if (platform === "linux" && arch === "x64") return BINDINGS.x64;
  if (platform === "win32" && arch === "x64") return BINDINGS.win32;
  if (platform === "darwin" && arch === "arm64") return BINDINGS.darwin_arm64;
  if (platform === "darwin" && arch === "x64") return BINDINGS.darwin_x64;
  return null;
}

const pkg = pkgForPlatform();
if (!pkg) {
  console.log("[postinstall] No rolldown binding hook for", process.platform, process.arch);
  process.exit(0);
}

try {
  require.resolve(pkg);
  process.exit(0);
} catch {
  console.log("[postinstall] Installing missing native binding:", pkg);
  execSync(`npm install ${pkg}@1.0.0-rc.15 --no-save --no-package-lock`, {
    stdio: "inherit",
    env: process.env,
  });
}
