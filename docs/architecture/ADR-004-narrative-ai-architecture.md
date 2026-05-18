# ADR-004: Arquitectura de Integración de IA Narrativa (llama.cpp)

## Status
Accepted

## Date
2026-05-16 (accepted 2026-05-16 after /architecture-review · spike OQ1 todavía pendiente, no bloquea acceptance de la arquitectura)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo (Hono + BullMQ) · Node.js 22 LTS (VERSION.md pinned) |
| **Domain** | Backend / AI Integration |
| **Knowledge Risk** | MEDIUM — llama.cpp y su API HTTP están en desarrollo activo; verificar versión del servidor al provisionar |
| **References Consulted** | `docs/engine-reference/web/modules/backend.md`, `docs/engine-reference/web/modules/web-game-patterns.md` §Anti-Cheat, `design/gdd/game-concept.md` §TR1 |
| **Post-Cutoff APIs Used** | llama-server HTTP API (llama.cpp) — verificar endpoint `/v1/completions` compatible con versión a usar |
| **Verification Required** | Spike de coste/latencia antes de confirmar modelo: tokens/sesión, RAM, tiempo de respuesta en hardware target (ver OQ1 en game-concept.md) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-001 (Web Stack — establece `apps/api/src/modules/<domain>/` como patrón de módulos Hono) |
| **Enables** | `narrative-ai.md` GDD (puede ahora especificar tipos de contenido y ACs de calidad) |
| **Blocks** | Epic de IA narrativa — no puede comenzar hasta que este ADR esté Accepted Y el spike de coste/latencia esté completado |
| **Ordering Note** | Este ADR puede estar Proposed durante los primeros sprints; debe estar Accepted antes del sprint que implemente `narrative-ai.md` |

## Context

### Problem Statement

Cascada FC usa llama.cpp para generar contenido narrativo contextual (resúmenes de partido, mensajes de prensa, rumores, ofertas IA-narradas). Sin una decisión de arquitectura clara, los implementadores tomarán decisiones incompatibles sobre: dónde corre el modelo, cómo se integra con Hono/BullMQ, qué pasa cuando falla, y qué constituye output válido. El QA lead en el design review flaggeó que sin ACs de calidad de output e implementación de fallback, el sistema de narrativa no puede tener criterios de aceptación testables.

### Constraints

- El modelo LLM corre **solo en el servidor** (`apps/api`) — el cliente nunca invoca el modelo directamente
- Solo developer → presupuesto de hardware y operaciones mínimo
- El juego debe funcionar aunque el modelo no esté disponible (fallback obligatorio)
- Los outputs de IA nunca deben bloquear el tick semanal del juego
- El contenido es en español; el modelo debe soportar español razonablemente bien
- TR1 del game-concept: la elección específica del modelo (tamaño, quant, hardware) está PENDIENTE de un spike de coste/latencia. Esta ADR define la arquitectura; el spike define los parámetros.

### Requirements

- El modelo corre en `apps/api` como un proceso separado (llama-server) controlado por la API
- Tiempo de respuesta máximo por generación: **8 segundos** en hardware target (si supera, usar fallback)
- Todo output de LLM pasa por una pipeline de validación antes de llegar al jugador
- Fallback catalog de textos hardcoded para cada tipo de contenido (mínimo 3 variantes por tipo)
- Ninguna generación de IA bloquea la evaluación del tick semanal o la respuesta HTTP principal
- Los outputs nunca contienen tokens de sistema del modelo (`[INST]`, `<<SYS>>`, `###`)
- El fallback es invisible para el jugador — se activa silenciosamente

## Decision

**llama-server HTTP API + BullMQ para contenido asíncrono + endpoint Hono síncrono con timeout para contenido urgente. Fallback a catálogo hardcoded en cualquier error.**

### Deployment Architecture

```
apps/api/
├── src/
│   ├── modules/
│   │   └── narrative/
│   │       ├── routes.ts           # GET /narrative/:type?clubId=...
│   │       ├── service.ts          # generateNarrative() — orquesta LLM + fallback
│   │       ├── llm-client.ts       # Wrapper de llama-server HTTP
│   │       ├── validator.ts        # Pipeline de validación de output
│   │       ├── fallback-catalog.ts # Textos hardcoded por tipo y contexto
│   │       └── types.ts
│   └── jobs/
│       └── narrative.worker.ts     # BullMQ worker para contenido no urgente

[Proceso separado en el mismo host]
llama-server --model /models/[model].gguf --port 8080 --n-predict 200
```

```
Flujo de generación (contento urgente — match summary al fin del partido):
  apps/api → narrative/service.ts → llm-client.ts → llama-server:8080 ← max 8s timeout
                                                          ↓ si falla
                                              fallback-catalog.ts ← texto hardcoded

Flujo de generación (contenido no urgente — mensajes de prensa, staff messages):
  BullMQ queue "narrative" → narrative.worker.ts → llm-client.ts → llama-server:8080
                                                         ↓ resultado
                                              Postgres (narrative_events table)
                                                         ↓ notificación
                                              Socket.IO → cliente
```

### Key Interfaces

```typescript
// apps/api/src/modules/narrative/types.ts
export type NarrativeType =
  | 'match_summary'      // resumen post-partido
  | 'press_reaction'     // reacción de prensa a resultado
  | 'staff_message'      // mensaje de empleado al jugador (jardinero, ojeador, etc.)
  | 'transfer_offer'     // oferta de otro club narrada
  | 'mayor_call';        // llamada de alcalde (manager RPG events)

export interface NarrativeContext {
  type: NarrativeType;
  clubId: string;
  weekNumber: number;
  /** Datos específicos del tipo: resultado del partido, nombre del jugador, etc. */
  params: Record<string, string | number | boolean>;
}

export interface NarrativeResult {
  text: string;
  source: 'llm' | 'fallback';
  generatedMs: number;   // tiempo de generación
  validated: boolean;    // pasó la pipeline de validación
}

// apps/api/src/modules/narrative/service.ts
export async function generateNarrative(
  ctx: NarrativeContext,
  timeoutMs?: number  // default: 8000
): Promise<NarrativeResult>;

// El caller no necesita saber si vino del LLM o del fallback.
// NarrativeResult.source es para logging/analytics interno.
```

### Output Validation Pipeline

Todo output del LLM pasa por esta pipeline antes de entregarse. Si falla cualquier check, se usa el fallback catalog.

```typescript
// apps/api/src/modules/narrative/validator.ts

const SYSTEM_TOKEN_PATTERNS = [/\[INST\]/i, /<<SYS>>/i, /###/, /<\|.*?\|>/];

export function validateNarrativeOutput(
  raw: string,
  ctx: NarrativeContext
): { valid: boolean; reason?: string } {
  // 1. Longitud mínima y máxima
  if (raw.length < 50) return { valid: false, reason: 'too_short' };
  if (raw.length > 400) return { valid: false, reason: 'too_long' };

  // 2. Sin tokens de sistema del modelo
  for (const pattern of SYSTEM_TOKEN_PATTERNS) {
    if (pattern.test(raw)) return { valid: false, reason: 'system_token' };
  }

  // 3. Coherencia básica con el resultado (solo para match_summary)
  if (ctx.type === 'match_summary') {
    const result = ctx.params['result'] as string; // 'win' | 'draw' | 'loss'
    const winWords = ['victoria', 'ganamos', 'triunfo', 'gana'];
    const lossWords = ['derrota', 'perdimos', 'cayó', 'pierde'];
    const hasWinWord = winWords.some(w => raw.toLowerCase().includes(w));
    const hasLossWord = lossWords.some(w => raw.toLowerCase().includes(w));
    if (result === 'win' && hasLossWord && !hasWinWord)
      return { valid: false, reason: 'result_mismatch' };
    if (result === 'loss' && hasWinWord && !hasLossWord)
      return { valid: false, reason: 'result_mismatch' };
  }

  // 4. Check básico de idioma (heurística: al menos 2 palabras comunes en español)
  const spanishCommon = ['el', 'la', 'los', 'las', 'un', 'una', 'en', 'de', 'que', 'es'];
  const words = raw.toLowerCase().split(/\s+/);
  const spanishCount = words.filter(w => spanishCommon.includes(w)).length;
  if (spanishCount < 2) return { valid: false, reason: 'language_check' };

  return { valid: true };
}
```

### Fallback Catalog Pattern

```typescript
// apps/api/src/modules/narrative/fallback-catalog.ts

const FALLBACKS: Record<NarrativeType, string[]> = {
  match_summary: [
    'El equipo salió a por todas. Resultado final en el marcador.',
    'Semana de partido completa. El equipo ha dado todo sobre el campo.',
    'Jornada finalizada. Toca analizar el resultado y preparar la siguiente semana.',
  ],
  press_reaction: [
    'La prensa recoge el resultado de hoy con atención.',
    'Los medios locales siguen de cerca la trayectoria del club.',
    'El resultado de hoy genera opiniones encontradas en la ciudad.',
  ],
  staff_message: [
    'Todo sigue su curso por aquí, jefe.',
    'Nada nuevo que reportar esta semana.',
    'Seguimos trabajando. Le avisaré si hay novedades.',
  ],
  transfer_offer: [
    'Hemos recibido una propuesta de otro club. Esperamos su decisión.',
  ],
  mayor_call: [
    'El señor alcalde ha intentado contactar con usted.',
  ],
};

export function getFallback(type: NarrativeType): string {
  const options = FALLBACKS[type];
  // Rotación determinista — no random para ser consistente con el estado del juego
  return options[Math.floor(Date.now() / 86400000) % options.length];
}
```

### llama-server Client

```typescript
// apps/api/src/modules/narrative/llm-client.ts
import { env } from '../../env';

const LLAMA_SERVER_URL = env.LLAMA_SERVER_URL ?? 'http://localhost:8080';

// NOTA: usar 127.0.0.1 en vez de localhost — Node.js 22 puede priorizar ::1 (IPv6)
// si llama-server solo escucha en IPv4, ECONNREFUSED silencioso.
const LLAMA_SERVER_URL_DEFAULT = 'http://127.0.0.1:8080';

const LlamaResponseSchema = z.object({
  content: z.string().min(1),
});

export async function callLlamaServer(
  prompt: string,
  maxTokens: number,
  timeoutMs = 8_000
): Promise<string> {
  // AbortSignal.timeout() lanza TimeoutError (DOMException), NO AbortError.
  const signal = AbortSignal.timeout(timeoutMs);

  const response = await fetch(`${LLAMA_SERVER_URL}/v1/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      n_predict: maxTokens,
      temperature: 0.7,
      stop: ['\n\n', '###'],
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`llama-server ${response.status}: ${await response.text()}`);
  }

  // Zod parse — nunca usar type assertion (bypasea runtime, rompe en error 4xx/5xx)
  const data = LlamaResponseSchema.parse(await response.json());
  return data.content.trim();
}

/** Health check para el worker — esperar a que llama-server esté listo al arrancar */
export async function waitForLlamaServer(maxWaitMs = 120_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${LLAMA_SERVER_URL}/health`, { signal: AbortSignal.timeout(2_000) });
      if (r.ok) return;
    } catch { /* llama-server not ready yet */ }
    await new Promise(r => setTimeout(r, 3_000));
  }
  throw new Error('llama-server did not become ready in time');
}
```

## Alternatives Considered

### Alternative A: Client-side inference (WebLLM / transformers.js)

- **Description**: El modelo corre en el navegador del jugador usando WebGPU o WASM.
- **Pros**: Sin coste de servidor; el jugador aporta su propia GPU.
- **Cons**: Modelos útiles requieren 4-16GB de VRAM — la mayoría de dispositivos no tienen. Tiempo de carga inicial de 2-10 minutos. Imposible en mobile PWA. La calidad con modelos pequeños que caben en browser es muy baja para español.
- **Rejection Reason**: Incompatible con la trayectoria MMO (el servidor debe mantener consistencia narrativa) y con mobile PWA.

### Alternative B: API externa (OpenAI, Anthropic, Groq)

- **Description**: En lugar de llama.cpp local, llamar a una API externa de LLM.
- **Pros**: Sin gestión de hardware; modelos muy capaces en español; latencia predecible.
- **Cons**: Coste variable + dependencia de terceros (privacidad, uptime, precios); el game-concept específicamente menciona "IA local" como diferenciador; el fallback sigue siendo necesario para offline/free tier.
- **Rejection Reason**: Contradice el requisito del concept doc de IA local. Sin embargo, esta ADR es compatible con migrar a una API externa en el futuro — `llm-client.ts` es el único punto de integración.

### Alternative C: Generación inline en el tick (sin BullMQ)

- **Description**: Cada tick semanal llama al LLM sincrónicamente dentro de la evaluación del tick.
- **Pros**: Los textos narrativos están disponibles inmediatamente junto con el resultado del tick.
- **Cons**: Hace el tick dependiente de un servicio externo (el modelo LLM); si el modelo tarda 8 segundos, el jugador espera 8 segundos por cada semana in-game; viola el patrón de pure function del tick (ADR-002/ADR-003).
- **Rejection Reason**: El tick es una pure function (ADR-002/ADR-003). La generación narrativa es I/O — debe estar fuera del tick. Los mensajes de staff pueden generarse asincrónamente y entregarse via Socket.IO después del tick.

## Consequences

### Positive

- **El juego nunca se bloquea por el LLM**: el fallback catalog garantiza continuidad; la generación asíncrona no impacta el tick.
- **El fallback es invisible**: el jugador no sabe si el texto vino del LLM o del catalog.
- **llm-client.ts aísla la integración**: si en el futuro se cambia a una API externa (Groq, Anthropic), solo cambia ese archivo.
- **Validación de output define los ACs de QA**: `validateNarrativeOutput()` es el criterio objetivo de aceptación — los tests pueden verificar que el output cumple la spec sin necesidad de evaluación humana por defecto.
- **BullMQ worker es retryable**: si el modelo falla, el job puede reintentarse automáticamente.

### Negative

- **Operaciones adicionales**: llama-server corre como proceso separado que el dev debe gestionar. Añadir al `docker-compose.yml` o arrancar manualmente.
- **RAM adicional**: un modelo 7B Q4 ocupa ~4.5GB RAM. En el mismo host que la API Node, el presupuesto de RAM sube significativamente.
- **La elección del modelo está pendiente de spike**: hasta completar el spike de coste/latencia (OQ1 del game-concept), los parámetros de `n_predict`, temperatura y el modelo específico son provisionales.

### Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Modelo demasiado grande para el presupuesto de RAM | MEDIO | ALTO | Hacer el spike antes de Sprint 1 de narrative; usar Q4_K_M quantization mínima |
| Latencia >8s en hardware target | MEDIO | MEDIO | Spike define el modelo correcto; si supera el budget, reducir maxTokens |
| llama-server no disponible en producción | BAJO | BAJO | El fallback catalog activa automáticamente; el juego continúa |
| TimeoutError capturado como AbortError (bug silencioso) | MEDIO | MEDIO | Usar `err.name === 'TimeoutError'` no `'AbortError'`. AbortSignal.timeout() lanza TimeoutError en Node.js 22. |
| Worker arranca antes que llama-server cargue el modelo | MEDIO | BAJO | `waitForLlamaServer()` en el arranque del worker; BullMQ retry cubre el caso si se llama tarde |
| localhost resuelve a ::1 (IPv6) en Node.js 22 | BAJO | MEDIO | Usar `http://127.0.0.1:8080` explícito en env.ts default, no `http://localhost:8080` |
| Output en idioma incorrecto (inglés) | BAJO | MEDIO | El prompt debe especificar español explícitamente; el validator lo detecta |
| Alucinación de datos del partido (marca gol inexistente) | MEDIO | MEDIO | El prompt incluye datos del partido como contexto; el validator chequea coherencia básica |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| `narrative-ai.md` (pendiente) | llama.cpp server-side — resúmenes de partido, prensa, mensajes | `apps/api/src/modules/narrative/` define el patrón de integración |
| `narrative-ai.md` (pendiente) | AC: output debe tener longitud entre 50-400 chars, sin tokens de sistema | `validateNarrativeOutput()` define el criterio testable |
| `narrative-ai.md` (pendiente) | Fallback cuando el modelo no está disponible | `getFallback()` con catalog hardcoded, activación transparente |
| `staff-system.md` (pendiente) | Mensajes de staff generados contextualmente | `NarrativeType: 'staff_message'` con `params: { staffRole, situation }` |
| `manager-rpg.md` (pendiente) | Llamadas de alcaldes IA-narradas (Pilar 3) | `NarrativeType: 'mayor_call'` con contexto de reputación del manager |

## Performance Implications

- **CPU**: El modelo llama.cpp consume todos los cores disponibles durante la inferencia. Configurar `--threads` para dejar CPU libre para Hono/BullMQ.
- **Memory**: 4.5-8GB RAM para el modelo (según modelo y quantization) + RAM normal del API (~200MB). Presupuesto de servidor mínimo: 16GB RAM.
- **Load Time**: llama-server tarda ~3-10 segundos en cargar el modelo al arrancar. El servidor API debe estar listo antes que el worker de narrativa.
- **Network**: Solo tráfico localhost (Hono API ↔ llama-server). Sin impacto en red exterior.

## Migration Plan

No hay código de narrativa existente. El fallback catalog es el punto de partida — se puede construir antes del spike (proporciona el criterio de calidad mínima). El LLM se añade cuando el spike confirma el modelo y el hardware.

**Secuencia recomendada**:
1. ✅ Escribir esta ADR (Proposed)
2. Implementar el fallback catalog + `generateNarrative()` retornando siempre fallback → Sprint 1 narrative puede completarse sin LLM
3. Spike de coste/latencia → confirmar modelo y hardware
4. Implementar `llm-client.ts` + validación pipeline → actualizar ADR a Accepted
5. Swap transparente: `generateNarrative()` intenta LLM primero, fallback si falla

## Validation Criteria

```typescript
// tests/unit/narrative/validator.test.ts

it('rejects output shorter than 50 chars', () => {
  expect(validateNarrativeOutput('Corto.', ctx).valid).toBe(false);
});

it('rejects output containing system tokens', () => {
  expect(validateNarrativeOutput('[INST] Responde en español [/INST] Victoria', ctx).valid).toBe(false);
});

it('rejects win summary text when result is loss', () => {
  const lossCtx = { ...ctx, type: 'match_summary', params: { result: 'loss' } };
  const text = 'Hoy ganamos el partido con gol en el último minuto. Victoria merecida.';
  expect(validateNarrativeOutput(text, lossCtx).valid).toBe(false);
});

it('accepts valid Spanish match summary for win', () => {
  const winCtx = { ...ctx, type: 'match_summary', params: { result: 'win' } };
  const text = 'Victoria contundente la de hoy. El equipo se mostró sólido en todas las líneas durante los 90 minutos.';
  expect(validateNarrativeOutput(text, winCtx).valid).toBe(true);
});

it('generateNarrative returns fallback when llama-server is unavailable', async () => {
  // Mock llm-client to throw
  const result = await generateNarrative({ type: 'match_summary', ... });
  expect(result.source).toBe('fallback');
  expect(result.text.length).toBeGreaterThan(0);
});
```

**IMPORTANTE — OQ1 pendiente**: La elección del modelo específico (tamaño, quantization, hardware) requiere el spike definido en `design/gdd/game-concept.md` OQ1. Esta ADR establece la arquitectura de integración; los parámetros del modelo se documentarán en una revisión de esta ADR o en `docs/architecture/narrative-ai-spike-results.md` una vez completado el spike.

## Related Decisions

- [ADR-001](ADR-001-web-stack.md) — stack base; BullMQ y Hono ya configurados
- [ADR-002](ADR-002-simulation-determinism.md) — los ticks del simulador son pure functions; la narrativa es I/O separado
- `design/gdd/game-concept.md` §TR1 — riesgo de coste/infra pendiente de spike
- `design/gdd/narrative-ai.md` (pendiente) — especificará los tipos de contenido y prompts
