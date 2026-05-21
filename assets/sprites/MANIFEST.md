# HD Sprite Manifest — Cascada FC

Canonical HD pixel art assets generated via the ComfyUI MCP server
(`tools/comfyui-mcp/`). All assets live in `assets/sprites/city-hd/`
and use the same pipeline for visual consistency.

## Pipeline

- **Checkpoint**: `sd_xl_base_1.0.safetensors`
- **LoRA**: `pixel-art-xl.safetensors` (strength 1.0 first pass, 0.6 second pass)
- **Workflow**: `comfyui_hires_fix` (2-pass hi-res fix)
- **Base resolution**: 1024×768 px (landscape) / 768×1024 px (portrait orientation)
- **Upscale**: 1.5× with `nearest-exact` (preserves pixel grid)
- **Final resolution**: 1536×1152 px (landscape) / 1152×1536 px (portrait)
- **Sampler/Scheduler**: `euler` / `karras`
- **CFG**: 7.5 · **Steps**: 32 pass 1 + 20 pass 2
- **Second pass denoise**: 0.4

## Display

Use CSS `image-rendering: pixelated` (or PixiJS `SCALE_MODES.NEAREST`)
to preserve pixel grid when scaling down to the display size. Recommended
display size: 256×192 px (1/6 of native). For full-screen hero scenes:
512×384 px (1/3 of native).

## Inventory

### Stadium Tiers (`stadium-t{0..3}-*.png`)

| Asset | Tier | Description | Seed |
|---|---|---|---|
| `stadium-t0-amateur.png` | T0 | Patchy grass amateur pitch, single goal, wooden bench, rural feel | 20260521010 |
| `stadium-t1-local.png` | T1 | Local club pitch with trees around, white lines, modest fence | 20260521011 |
| `stadium-t2-regional.png` | T2 | Match scene with players in formation, two goals, professional | 20260521012 |
| `stadium-t3-premier.png` | T3 | Anfield-style full bowl, red stands with white roof, capacity crowd | 20260521002 |

All stadium tiers are 1536×1152 px landscape. T3 is the canonical "club is at the top" sprite.

### Buildings (`building-*.png`)

| Asset | Use | Description | Seed |
|---|---|---|---|
| `building-academy.png` | Youth academy | Brick school with arched entrance + ivy | (legacy batch) |
| `building-gym.png` | Training facility | Blue/white gym with equipment visible | (legacy batch) |
| `building-mansion.png` | Player housing | 2-story mansion with palm trees | 20260521020 |
| `building-medical.png` | Medical center | White clinic with red cross + ambulance | (legacy batch) |
| `building-office.png` | Club HQ | 2-story brick/glass office with FC sign | (legacy batch) |
| `building-parking.png` | Parking lot | Top-down asphalt lot with parked cars | 20260521040 |
| `building-training-pitch.png` | Practice pitch | Small training ground with players + 2 goals | 20260521030 |

All buildings are 1536×1152 px landscape.

### Characters (`char-*.png`)

| Asset | Use | Description | Seed |
|---|---|---|---|
| `char-manager-sheet.png` | Manager character | Suited manager sprite sheet (poses + portraits + briefcase) | 20260521130 |
| `char-player-sheet.png` | Player character | Female player #10 sprite sheet (red kit, animations + portrait) | 20260521140 |

Characters are 1152×1536 px portrait orientation.

### Props (`prop-*.png`)

| Asset | Use | Description | Seed |
|---|---|---|---|
| `prop-banners.png` | Club crest grid | 28-cell grid of club banner/crest variants | 20260521110 |
| `prop-corner-flags.png` | Field props | 4 corner flag variants with red triangular flags | 20260521070 |
| `prop-goalposts.png` | Field props | 6 goalpost+net variants (white/wooden frames) | 20260521100 |
| `prop-jerseys.png` | UI props | 5 colored jerseys on a hanger rail | 20260521120 |
| `prop-soccer-balls.png` | UI props | 16 soccer ball variants (condition states) | 20260521090 |
| `prop-trophies.png` | UI props | 4 trophy cups on pedestals (gold/silver/bronze/hex) | 20260521080 |

Most props are 1536×1152 px landscape.

## Reproducibility

To regenerate any asset, use the `comfyui_hires_fix` MCP tool with:
- The same `checkpoint`, `loraStack`, `baseWidth/baseHeight`, `upscaleBy`,
  `steps`, `secondPassSteps`, `cfg`, `sampler`, `scheduler`, `secondPassDenoise`
- The same `seed` (deterministic)
- The same `positivePrompt` / `negativePrompt` (see test-hires-fix.mjs presets for the canonical T0-T3 + initial 4 buildings)

Test presets live in `tools/comfyui-mcp/test-hires-fix.mjs`. New presets
generated during 2026-05-21/22 overnight batch are inline in this MANIFEST
under each asset row (seed only — full prompts in git log of relevant commits).

## Scratch Directory

`assets/sprites/_raw/` is gitignored. Experimental generations land here.
Only approved assets are promoted (copied) to `assets/sprites/city-hd/`.
Rejected experiments stay in `_raw/` until manually purged or pruned by
the `/asset-audit` skill.

## Integration

Routes that consume these assets:

- `/stadium` — uses `stadium-t{N}-*.png` based on current club tier
- `/city` — uses `building-*.png` tiles + `prop-*.png` decoration
- `/match` (future) — uses `char-player-sheet.png` + `prop-corner-flags.png` + `prop-goalposts.png` + `stadium-t{N}-*.png` as background
- `/staff` (future) — uses `char-manager-sheet.png` portrait
- Trophy room / season recap — uses `prop-trophies.png` + `prop-banners.png`

See PixiJS canvas integration in `apps/web/src/lib/pixi/`.

## License + Attribution

All sprites are generated locally with Stable Diffusion XL base + the
`pixel-art-xl` LoRA. No external assets, no API calls. Game assets are
project-owned. The pixel-art-xl LoRA itself has its own license; see
`tools/comfyui-mcp/README.md` for attribution requirements.
