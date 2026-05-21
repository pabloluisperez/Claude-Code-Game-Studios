# Cascada FC / Total Soccer Manager — Roadmap

**Owner**: Pablo (solo dev)
**Created**: 2026-05-21 (autopilot session, post-Sprint 14)
**Status**: Living document — revisar al cierre de cada versión

Este es el roadmap consolidado del producto desde el MVP v1.0 hasta la
visión completa multi-año. Cada versión tiene su propio plan detallado
con sprints, GDDs nuevos, criterios de unlock y riesgos.

---

## 0. Vision recap

El producto persigue 4 pilares (game-concept.md §Core Identity). MVP v1.0
shippea 2 pilares; v1.1 + v1.2 completan los otros 2. v1.3+ es live-ops y
v2.0 es la visión multi-año (MMO, multi-sport).

| Pillar | Versión |
|--------|---------|
| A. Soccer Manager (cascadas + match sim + economía) | ✅ v1.0 |
| B. Mundo Isométrico Vivo (city builder + PixiJS) | 🔵 v1.1 |
| C. Manager-RPG (progresión personal) | ✅ v1.0 |
| D. IA Narrativa Local (llama.cpp) | 🟣 v1.2 |

Decisión histórica: scope cut MVP de 4→2 pilares 2026-05-17 — ver
`design/gdd/scope-mvp.md`.

---

## 1. Version timeline (estimada)

```
2026-05    2026-08    2026-12    2027-06    2027-12    2028+
   │          │          │          │          │         │
   │ v1.0     │ v1.1     │ v1.2     │ v1.3     │ v2.0    │
   │ MVP      │ Mundo    │ IA       │ Live-ops │ MMO     │
   │ ship     │ Isomé-   │ Narra-   │ cadence  │ + multi-│
   │          │ trico    │ tiva     │          │ sport   │
   │          │          │          │          │         │
   │ 1mo      │ 4-5mo    │ 3-4mo    │ ongoing  │ 12mo+   │
```

> **Estimaciones**: solo dev, ~80 días productivos por 5 meses (16 days/mo).
> Cada versión incluye 20% buffer. Las fechas se ajustan tras cada cierre.

| Versión | Scope | Estimación | Estado |
|---------|-------|------------|--------|
| **v1.0.0** | MVP — Pillar A + C, DOM-only | shipped | 🟡 Soft-launch pending (~2h manual validation) |
| **v1.0.x** | Hotfix + maintenance | ~4 weeks | 📋 Planned |
| **v1.1.0** | Mundo Isométrico Vivo (Pillar B) | ~16-20 weeks (4-5 mo) | 📋 Planned |
| **v1.2.0** | IA Narrativa Local (Pillar D) | ~12-16 weeks (3-4 mo) | 📋 Planned |
| **v1.3.x** | Live-ops cadence (events, multi-liga, generational) | ongoing | 📋 Planned |
| **v2.0.0** | MMO foundations + sport-agnostic + native mobile | 12+ months | 📋 Vision |

---

## 2. Plan documents

| Doc | Cubre |
|-----|-------|
| [v1.0.x Maintenance](v1.0.x-maintenance.md) | Primeras 4 semanas post-launch — hotfix cadence, observability, telemetry baseline |
| [v1.1 Mundo Isométrico Vivo](v1.1-mundo-isometrico.md) | Pillar B detallado — sprints, 2 GDDs nuevos (city-progression + isometric-world), PixiJS scope, art bible application |
| [v1.2 IA Narrativa Local](v1.2-ai-narrativa.md) | Pillar D detallado — sprints, GDD narrative-ai, llama.cpp spike + integration, prompt pipeline, hosting cost |
| [v1.3 Live-ops cadence](v1.3-live-ops.md) | Post-Pillar-B+D content cadence — seasonal events, multi-liga, generational play, balance pulse |
| [v2.0 MMO + multi-sport vision](v2.0-vision.md) | Direction doc — MMO foundations, sport-agnostic engine, mobile native, monetization |

---

## 3. Unlock criteria entre versiones

Cada versión sólo arranca si la anterior cumple sus unlock criteria.
No hay shortcuts.

### v1.0.x → v1.1

Definidos en `design/gdd/scope-mvp.md` §7.1:

- [ ] MVP shipped y estabilizado (≥ 4 semanas en producción sin S1)
- [ ] Playtest data: jugadores piden la "ciudad creciendo" explícitamente
      (encuesta + Sentry feature requests, no asumir)
- [ ] Velocity real conocida (estimaciones MVP fueron ±X% — calcular el X
      al final de v1.0.x)
- [ ] Art bible validation prototype revisado y firmado visualmente
      (sigue desde scope-mvp.md, opcional si v1.0 confirma demanda)

Plus condiciones del autopilot añadidas 2026-05-21:

- [ ] Sentry error rate < 1% por 14 días consecutivos
- [ ] Soak en producción sin OOM en 30 días
- [ ] ≥ 20 jugadores activos semanales (signal de demanda mínimo)
- [ ] Backup restore practicado al menos 1 vez en producción

### v1.1 → v1.2

Definidos en `design/gdd/scope-mvp.md` §7.2:

- [ ] v1.1 shipped (Pillar B funcional, isometric world responde a estado club)
- [ ] Spike llama.cpp completado: coste, latencia, calidad output conocidos
- [ ] Hosting cost model validado contra revenue (si freemium activado)
- [ ] Staff-system templates revelan limitaciones que solo AI resuelve
      (lista de "casos imposibles" con templates fijos)

Plus:

- [ ] v1.1 retention day-7 ≥ 30% (validar que añadir visual mejora retention)
- [ ] Performance de v1.1 dentro de budgets (60fps PixiJS en device target)

### v1.2 → v1.3

- [ ] v1.2 shipped (narrativa IA generando texto coherente y no-tóxico)
- [ ] Cost per active user < threshold definido en v1.2 plan
- [ ] AI safety review pasado (sin output racista/sexista/etc.)
- [ ] Live-ops infrastructure ready (event scheduler + content authoring)

### v1.3 → v2.0

- [ ] v1.3 en producción ≥ 6 meses
- [ ] DAU/MAU ratio justifica investment MMO (> 0.2)
- [ ] Sport-agnostic refactor diseñado (architecture review aprobado)
- [ ] Mobile PWA performance baseline establecido

---

## 4. Cross-cutting concerns

Estos hilos afectan a todas las versiones — gestionar continuamente,
no por versión:

### 4.1 Accessibility (WCAG 2.1 AA)

Mantener PASS en cada versión. Cada nuevo screen pasa axe-core + manual
keyboard + screen reader review antes de merge. v1.1 añade canvas →
mantener equivalente DOM para usuarios de screen reader.

### 4.2 Determinism

Toda lógica nueva (PixiJS rendering NO; cualquier cosa que muta WorldState
SÍ) debe pasar tests deterministas. v1.1 city progression usa cascade
engine → trivial. v1.2 AI narrativa NO muta WorldState, sólo lee → seguro.

### 4.3 Sport-agnostic engine

Diseñar nuevas mecánicas con la pregunta: *¿esto reusaría si añadimos
baloncesto?* Si la respuesta es "no, está acoplado a fútbol", pensar en
una abstracción. Aplicar especialmente en v1.3 cuando se añadan eventos
y en v2.0 directamente.

### 4.4 Localization

MVP es ES-only. v1.1+ NO añade i18n hasta v1.3 (live-ops) como mínimo —
añadirlo antes complica el copy review de cada feature nueva.

### 4.5 Live-ops infrastructure

A partir de v1.1 cada feature nueva considera: *¿se puede tunear sin
deploy?* — feature flags + content authoring desde DB. Esto se formaliza
como sistema en v1.3.

### 4.6 Privacy + GDPR

- v1.1+: el GDPR data-export endpoint prometido en Privacy Policy §7 debe
  implementarse en v1.1 a más tardar.
- v1.2: la IA narrativa NO almacena nada del jugador en prompts (sólo
  estado del club abstracto).
- v2.0 MMO: privacy review formal antes de cualquier feature social.

---

## 5. Decision log

| Fecha | Decisión | Razón |
|-------|----------|-------|
| 2026-05-17 | MVP = 2 pilares (A+C), DOM-only | Solo dev viability, scope summit |
| 2026-05-21 | v1.1 = Pillar B (Mundo Isométrico), v1.2 = Pillar D (IA Narrativa) | Pillar B tiene pre-investment (art bible + validation prototype); D requiere spike llama.cpp |
| 2026-05-21 | Roadmap hasta v2.0 documentado pre-launch | Pablo solicitó planning paralelo a soft-launch para empezar v1.1 cuanto antes |

---

## 6. Next actions

1. Cerrar v1.0 (tag v1.0.0 + deploy soft-launch tras 2h de validación
   manual — ver `production/releases/go-no-go-v1.0.md`).
2. Arrancar v1.0.x maintenance window (4 semanas). En paralelo: dar primer
   pase a `production/roadmap/v1.1-mundo-isometrico.md` para empezar a
   identificar el spike de PixiJS que necesita v1.1.
3. Cuando los unlock criteria v1.0.x → v1.1 estén verdes, ejecutar
   `/sprint-plan new` para Sprint 15 (primer sprint de v1.1).
