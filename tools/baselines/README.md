# Performance baselines

Captured with `node tools/profile.js --stage N --frames 300` at 900x520 in
headless Chromium.

- `before-*.json` — commit c2fb15f, the state of the game before this work.
- `after-*.json` — the same stages after the rendering changes.

The figure that matters is `blit.sourceMPPerFrame`: megapixels of source
texture resampled per frame. It is hardware independent, so it means the same
thing on a laptop and on a CI runner, unlike wall-clock timings.

| stage | source MP/frame | heavy downscales | draw p95 |
|-------|-----------------|------------------|----------|
| 1  | 31.24 -> 0.89 (35x) | 22.1 -> 0 | 0.6 ms -> 1.7 ms |
| 21 | 35.71 -> 0.88 (41x) | 28.3 -> 0 | 4.0 ms -> 1.6 ms |

Stage 1 is worth reading carefully: its wall-clock draw time got *slower* on
desktop. That stage has few entities, so the cache's per-blit bookkeeping is
not repaid by the texture reads it saves, and desktop Chromium was already
absorbing the oversized textures cheaply. Stage 21 — busier, and closer to
what a phone struggles with — improves 2.5x on p95. The texture reduction is
what carries the win on mobile GPUs, which have far less texture bandwidth and
no equivalent slack.

## Re-measuring

Both figures for the same build, with and without the cache:

```bash
node tools/profile.js --stage 21 --frames 300 --no-cache   # control
node tools/profile.js --stage 21 --frames 300              # with cache
```
