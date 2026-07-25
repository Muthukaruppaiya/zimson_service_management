# Landing media assets

- `watch-reveal.mp4` — scroll-scrubbed hero footage. Re-encoded at **1920×1080** with an
  **all-intra GOP (every frame is a keyframe, no B-frames)** so `video.currentTime` seeks are
  near-instant on every scroll tick — this fixes choppy/laggy frame changes. (~18MB for 10s.)
- `watch-reveal-720.mp4` — original 720p source (kept for reference / re-processing).
- **For best real-world quality, replace `watch-reveal.mp4` with your native footage** (same
  filename) — export it the same way: `-g 1 -keyint_min 1 -sc_threshold 0 -bf 0` (all-intra) so
  scroll-scrubbing stays smooth. A normal long-GOP export (default keyint ~250) will feel jumpy
  when scrubbed, regardless of resolution, because seeking has to decode forward from a distant
  keyframe on every scroll tick.
- Optional WebM: export as `watch-reveal.webm` the same way if you want a secondary source.

## Regenerating

```
npm install --no-save ffmpeg-static
node -e "require('ffmpeg-static')" # confirms path
```

Then encode with the flags above via the ffmpeg binary at `node_modules/ffmpeg-static/ffmpeg.exe`.
