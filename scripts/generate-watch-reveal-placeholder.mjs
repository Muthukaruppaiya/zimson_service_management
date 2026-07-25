/**
 * Generates a navy/gold watch-reveal placeholder video for the landing-page scroll scrub.
 * Replace public/media/watch-reveal.{mp4,webm} with the real client footage when ready.
 *
 * Usage: node scripts/generate-watch-reveal-placeholder.mjs
 * (requires: npm install --no-save ffmpeg-static)
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public", "media");
mkdirSync(outDir, { recursive: true });

let ffmpegPath;
try {
  ffmpegPath = require("ffmpeg-static");
} catch {
  console.error("ffmpeg-static not found. Run: npm install --no-save ffmpeg-static");
  process.exit(1);
}

if (!ffmpegPath || !existsSync(ffmpegPath)) {
  console.error("ffmpeg binary missing at", ffmpegPath);
  process.exit(1);
}

const mp4 = path.join(outDir, "watch-reveal.mp4");
const webm = path.join(outDir, "watch-reveal.webm");

function run(args, label) {
  console.log("→", label);
  const r = spawnSync(ffmpegPath, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("ffmpeg failed for", label);
    process.exit(r.status ?? 1);
  }
}

run(
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x08143A:s=1280x720:d=4:r=30",
    "-f",
    "lavfi",
    "-i",
    "color=c=0xC9A227:s=1280x720:d=4:r=30",
    "-filter_complex",
    [
      "[1]format=rgba,geq=r='201':g='162':b='39':a='if(lte(hypot(X-W/2\\,Y-H/2)\\,40+T*70)\\,if(gte(hypot(X-W/2\\,Y-H/2)\\,30+T*70)\\,200\\,0)\\,0)'[ring]",
      "[0][ring]overlay=format=auto,format=yuv420p",
    ].join(";"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    mp4,
  ],
  "watch-reveal.mp4",
);

const webmResult = spawnSync(
  ffmpegPath,
  ["-y", "-i", mp4, "-c:v", "libvpx-vp9", "-b:v", "1M", "-an", webm],
  { stdio: "inherit" },
);

if (webmResult.status !== 0) {
  console.warn("VP9 webm encode unavailable — MP4 alone is enough for scrubbing.");
}

console.log("Done:", mp4);
if (existsSync(webm)) console.log("Done:", webm);
