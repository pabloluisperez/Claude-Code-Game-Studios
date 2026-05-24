# Cascada ComfyUI MCP

Custom MCP server exponiendo ComfyUI HTTP API a Claude Code para el
asset pipeline.

**Status**: ✓ Connected (verificado 2026-05-21 contra ComfyUI 0.22.0 en bosgame.localdomain:8188)

## Tools expuestas

| Tool | Descripción |
|------|-------------|
| `comfyui_system_stats` | Versión, RAM, VRAM, GPU del servidor |
| `comfyui_list_checkpoints` | Modelos disponibles |
| `comfyui_list_loras` | LoRAs disponibles (vacío si ninguno) |
| `comfyui_list_samplers` | KSampler samplers + schedulers válidos |
| `comfyui_queue_status` | Workflows running + pending |
| `comfyui_generate_image` | End-to-end txt2img single-pass — para iteración rápida (~30s/imagen) |
| `comfyui_hires_fix` | **Production-grade 2-pass workflow** — pixel art de calidad publishable (~50s/imagen) |
| `comfyui_fetch_image` | Re-fetch imagen por filename (de workflow previo) |

## Hi-res fix workflow (production assets)

Para assets finales (la calidad que ves en `assets/sprites/city-hd/`) usa
`comfyui_hires_fix`. Implementa el workflow canónico 2-pass:

1. **Pass 1** — KSampler @ `baseWidth × baseHeight` (típico 1024×768) con LoRA
   full strength + denoise 1.0. Genera la composición y el pixel art carácter.
2. **LatentUpscaleBy** — sube el latent (no el PNG decoded) por `upscaleBy`
   (1.5 por defecto) con `nearest-exact` que preserva la grilla de píxeles.
3. **Pass 2** — KSampler @ resolución upscaled con LoRA opcionalmente reducido
   (0.6 típico) + `secondPassDenoise` 0.3-0.5. Añade detalle sin romper composición.
4. **VAEDecode + SaveImage** — output final.

Resultado: misma composición que single-pass, ~2.25× píxeles totales, detalle
extra en el segundo pass. Tiempo: ~50s en Radeon 8060S vs ~30s para single-pass.

### Preset canónico para Cascada FC (validado 2026-05-21)

```typescript
{
  checkpoint: 'sd_xl_base_1.0.safetensors',
  baseWidth: 1024, baseHeight: 768,  // landscape para buildings + stadiums
  upscaleBy: 1.5,                     // final 1536×1152
  upscaleMethod: 'nearest-exact',     // preserva pixel grid
  steps: 28, secondPassSteps: 18,
  cfg: 7, sampler: 'euler', scheduler: 'karras',
  secondPassDenoise: 0.4,
  loraStack: [{ name: 'pixel-art-xl.safetensors', strengthModel: 1.0, strengthClip: 1.0 }],
  secondPassLoraStack: [{ name: 'pixel-art-xl.safetensors', strengthModel: 0.6, strengthClip: 0.6 }],
}
```

Style suffix para prompts: `", retro 16-bit pixel art, Stardew Valley style,
sharp chunky pixels, pixel-art-xl, clean silhouette"`.

Ver `test-hires-fix.mjs` para presets de cada asset producido (T0-T3 stadium
tiers, office, gym, medical, academy).

## Config en `.mcp.json` (project scope)

```json
{
  "mcpServers": {
    "comfyui": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/tools/comfyui-mcp/src/server.ts"],
      "env": {
        "COMFYUI_URL": "http://bosgame.localdomain:8188",
        "COMFYUI_OUTPUT_DIR": "assets/sprites/_raw"
      }
    }
  }
}
```

## Para añadir a otro host

```bash
claude mcp add comfyui --scope project \
  --env COMFYUI_URL=http://bosgame.localdomain:8188 \
  --env COMFYUI_OUTPUT_DIR=assets/sprites/_raw \
  -- npx -y tsx /path/to/tools/comfyui-mcp/src/server.ts
```

## Arquitectura interna

```
Claude Code (stdio)
       │
       ▼
server.ts (MCP transport)
       │
       ├── comfyui-client.ts (HTTP wrapper)
       │       │
       │       ▼
       │   ComfyUI 0.22.0 (bosgame.localdomain:8188)
       │       │
       │       ▼
       │   GPU Radeon 8060S, 96GB VRAM, ROCm 7.2
       │
       └── workflow-builder.ts (txt2img graph DSL)
```

Endpoints HTTP ComfyUI consumidos:

- `GET  /system_stats`
- `GET  /object_info/<NodeType>` (descubrir enums)
- `POST /prompt` (queue workflow)
- `GET  /queue` (status)
- `GET  /history/{id}` (poll completion)
- `GET  /view?filename=...&type=output` (descarga PNG)

## Próximos pasos

1. Probar end-to-end: `comfyui_generate_image` con un prompt simple
2. Si funciona → batch sprint 22 (~30 tiles + props + buildings)
3. Cuando Pablo descargue SDXL + LoRAs, no hay cambios en el MCP — solo
   se actualizan los args del `loraStack` en las llamadas.

## Troubleshooting

- **MCP no conecta**: ejecuta `claude mcp list` — debe decir `✓ Connected`.
  Si falla, mira logs con `claude mcp logs comfyui` (si existe) o ejecuta
  el server manualmente: `npx tsx tools/comfyui-mcp/src/server.ts` y
  manda un JSON-RPC init via stdin.
- **ComfyUI unreachable**: verifica conectividad con
  `curl http://bosgame.localdomain:8188/system_stats`. Si no responde,
  el problema es de red/DNS o ComfyUI no está corriendo.
- **Generación tarda**: el timeout default es 5min. Para workflows largos
  (FLUX en SDXL), considera subir `totalTimeoutMs` en el código si hace
  falta.
