# Asset Pipeline — Cascada FC / Total Soccer Manager

**Status**: 🟡 Setup phase (autopilot 2026-05-21)
**Owner**: Pablo (infra) + Claude (orchestration via ComfyUI MCP)
**Cross-ref**: `design/art/art-bible.md` §8 (Asset Standards), §8.6 (AI Generation Usage)

Este pipeline gobierna la producción de assets visuales del juego. Combina:

1. **ComfyUI local** (en la máquina GPU de Pablo en red local) — generación de sprites pixel art
2. **MCP server** — interfaz que permite a Claude lanzar workflows y recoger outputs
3. **Post-process** (TypeScript en `tools/asset-pipeline/`) — palette quantization, validation, atlas bake
4. **Convenciones del Art Bible** — naming, paletas, dimensiones, hard limits

---

## 1. División de trabajo AI vs manual

Per Art Bible §8.6:

### ✅ AI generation OK (con cleanup pass obligatorio)

- Tiles de suelo (dirt, grass, pavement) en paleta §4
- Props genéricos sin carga narrativa (banco, farola, valla)
- Crowd-tiles de densidad media
- Variantes climáticas de tiles existentes
- **(Sprint 26+)** Entidades world-life genéricas (peatones, ciclistas, coches, etc.)
- **(Sprint 26+)** Building modules genéricos (gradas, casas residenciales sin character)

### ❌ NUNCA AI — producción manual obligatoria

- Logo y escudo del club (SVG paramétrico, no sprites)
- Retratos hero del manager (§5.1 progresión RPG)
- Props narrativos: placa dedicatoria, foto enmarcada despacho, carta histórica, trofeo específico
- Portraits NPCs con nombre (director deportivo, alcalde, periodista recurrente)
- Assets de threshold crossing moments (§2 Estado 4)

---

## 2. Stack tecnológico

### 2.1 ComfyUI (host con GPU)

- **Version**: ComfyUI ≥ commit Q4-2026 (Pablo pin)
- **Modelos base recomendados**:
  - **Primario**: `stabilityai/stable-diffusion-xl-base-1.0` (SDXL) — best LoRA ecosystem
  - **Opcional para hero assets**: `black-forest-labs/FLUX.1-dev` o `FLUX.1-schnell` si VRAM ≥ 24GB
- **LoRAs a descargar**:
  - `nerijs/pixel-art-xl` (HuggingFace) — base pixel art para SDXL
  - `pixel-art-style` (CivitAI, 119592) — refuerzo pixel
  - `isometric-pixel-art` (CivitAI) — específico iso si encontrado
  - `chibi-character-style` — para sprites 16×24 chibi
  - Habbo-style LoRA — si existe (probable train custom v1.3+)
- **VAE**: `madebyollin/sdxl-vae-fp16-fix` (mejor para output limpio sin artefactos)
- **Custom nodes recomendados**:
  - `ComfyUI-Custom-Scripts` (general utility)
  - `ComfyUI_essentials` (palette quantization node, downscale clean)
  - `ComfyUI-Impact-Pack` (segmentation para sprite extraction)
  - `ComfyUI-Manager` (instala los demás)

### 2.2 MCP server

Opciones evaluadas:

| Repo | Pro | Con |
|------|-----|-----|
| `comfy-org/comfy-mcp-server` (oficial) | Mantenido por equipo ComfyUI; ABI estable | Más reciente, menos battle-tested |
| `joenorton/comfyui-mcp-server` | Más maduro; community proven | Mantenimiento variable |
| `cubiq/comfy-mcp` | Tools ricos (list_models, list_loras, queue, history) | Menos popular |

**Recomendación**: prueba `comfy-org/comfy-mcp-server` primero. Si tiene
limitaciones de tools, prueba `cubiq/comfy-mcp`. Cuando esté arriba,
ejecuta `<MCP>__list_tools` y compárteme el output — adapto el orquestador
a las tools que exponga.

### 2.3 Post-process (TypeScript)

`tools/asset-pipeline/`:

- `palette-quantize.ts` — fuerza output a paleta Art Bible §4
- `validate-palette.ts` — script CI; rechaza PNGs con colores fuera de paleta
- `downscale-clean.ts` — nearest-neighbor downscale a tile size objetivo
- `atlas-assemble.ts` — TexturePacker JSON Hash (PixiJS-compatible)
- `comfyui-client.ts` — wrapper sobre el MCP que orquesta workflows

Stack: Node 22 + `sharp` (image processing) + `tsx` runner.

---

## 3. Flow de generación end-to-end

```
[ Claude lee asset catalog ]
        │
        ▼
[ Prompt template + variables ]
        │
        ▼
[ MCP → ComfyUI workflow ]
        │
        ▼
[ 1024×1024 raw SDXL output ]
        │
        ▼
[ palette-quantize (paleta §4) ]
        │
        ▼
[ downscale-clean (nearest-neighbor) ]
        │
        ▼
[ validate-palette (script CI) ]
        │
        ├── PASS → guarda en `assets/sprites/<category>/`
        └── FAIL → re-generate con prompt ajustado
```

Iteración manual: cada batch generado se revisa con Pablo. Approved →
incluido en atlas bake. Rejected → re-prompt o pasa a manual.

---

## 4. Roadmap de generación

| Phase | Scope | Sprint |
|-------|-------|--------|
| 1. Setup MCP + first asset | 1 tile suelo (grass-healthy 32×16) end-to-end | Inmediato post-MCP |
| 2. Tier 1 baseline | Tiles + 4 building modules T1 + 3 props básicos | Sprint 22 |
| 3. Tier 2-3 expansion | +6 tiles + +12 buildings + +10 props + crowd-tiles | Sprint 23 |
| 4. Tier 4 + variants | T4 completo + variantes day-night + variante lluvia | Sprint 24 |
| 5. World-life entities | 11 entity sprites (walker variants, vehicles) + animations 2-frame | Sprint 26 |
| 6. Polish + atlas final | Atlas bake + perf validation | Sprint 28 |

---

## 5. Calidad assurance

### 5.1 Pre-merge checks (CI)

Cada PR con assets nuevos pasa:

1. `pnpm asset:validate-palette` — todos los PNG usan paleta §4
2. `pnpm asset:check-dimensions` — todos los sprites coinciden con §8.2 categorías
3. `pnpm asset:check-naming` — naming convention §8.4
4. `pnpm asset:build-atlas` — atlas builds sin errores

### 5.2 Visual review

Cada batch de assets generados con AI requiere review manual por Pablo
antes de merge a `assets/sprites/`. Criterio:

- Silueta legible a 50% zoom
- Cell-shading 3 tonos consistente
- Sin halos / bordes con alpha parcial
- Coherente con Art Bible §1.2 principios visuales

### 5.3 Cleanup pass (mandatory per Art Bible §8.6)

Antes de aceptar cualquier AI-generated:

1. Palette check (script automático)
2. Dithering manual review (sólo en transiciones)
3. Cell-shading 3 tones (manual)
4. Hero findability test (silueta a 16px width)

Cualquier fallo → re-generate o sustituir manual.

---

## 6. Storage

Per Art Bible §8.4:

```
assets/
├── source/           # Masters .aseprite (no bundled) — para manual edits
├── sprites/          # PNG individuales generados (input al atlas)
│   ├── chars/
│   ├── tiles/
│   ├── props/
│   ├── buildings/
│   ├── crowds/
│   ├── world-life/   # NEW v1.1 — entidades ambient
│   └── portraits/    # NUNCA AI — manual only
├── atlas/            # PNG + JSON generados (build output, en .gitignore)
├── icons/            # SVG iconos custom (manual)
└── audio/            # OGG (separate pipeline)
```

Git policy:
- `assets/sprites/` SÍ committed (source of truth)
- `assets/atlas/` NO committed (regenerable build output)
- `assets/source/.aseprite` SÍ committed (masters)

---

## 7. Cuando estés listo

Cuando termines de:

1. Instalar ComfyUI en la máquina GPU
2. Descargar modelos + LoRAs recomendados (§2.1)
3. Instalar el MCP server
4. Conectar el MCP a esta sesión

Dime:

```
- URL del ComfyUI (http://192.168.x.x:8188 o equivalente)
- Nombre del MCP server activo (`mcp__comfyui` o equivalente)
- Output de <MCP>__list_tools si lo expone
- Output de <MCP>__list_models y <MCP>__list_loras si están disponibles
```

Y arranco con un primer test: generar un tile de suelo grass-healthy 32×16
end-to-end para validar el pipeline completo antes de batch grande.

---

## 8. Documentos asociados

- `docs/asset-pipeline/catalog.md` — qué assets necesitamos generar (lista exhaustiva)
- `docs/asset-pipeline/prompts.md` — templates de prompts por categoría
- `docs/asset-pipeline/workflows.md` — workflow JSON outlines (post-MCP setup)
- `design/art/art-bible.md` — visual identity binding (§8 Asset Standards)
- `design/gdd/city-progression.md` — qué se renderiza en cada tier
- `design/gdd/world-life.md` — entidades ambient y sus variantes
