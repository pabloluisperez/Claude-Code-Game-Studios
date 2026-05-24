# MVP Scope Decision — Cascada FC

*Created: 2026-05-17*
*Status: Approved (scope summit 2026-05-17, post-/gate-check Pre-Production FAIL 2026-05-16)*
*Decision authority: User (solo dev) + Producer recommendation*
*Supersedes: implicit 4-pillar scope in game-concept.md L41-52*

---

## 1. Overview

**Decision**: cut MVP from 4 pillars to **2 pillars** — **Soccer Manager** (cascade engine + match sim + economía) + **Manager-RPG** (progresión personal del jugador-personaje).

**Deferred to v1.1+**: *Mundo Isométrico Vivo* (city builder + isometric rendering) y *IA Narrativa Local* (llama.cpp).

**Visual presentation MVP**: **DOM-only**. UI estilo Football Manager clásico (paneles, listas, tablas). Cero canvas. Cero PixiJS. El art bible y el `cascada-art-bible-validation` prototype quedan como pre-inversión para v1.1+.

**Rationale**: ~80 días productivos solo en 4-6 meses ÷ 4 pilares = 20 días por pilar (no viable). Producer NOT READY verdict del gate 2026-05-16 lo formaliza. Cortar a 2 pilares deja ~40 días por pilar — viable, sostenible, y testea la hipótesis central (¿el loop cascada-driven de gestión + progresión personal es divertido por sí solo?) antes de gastar capital en el visual.

---

## 2. Player Fantasy — What Survives MVP

**Core fantasy preservada** (de game-concept.md §"Core Fantasy"):
- "Coges un club de cero, lo conviertes en un imperio temporada tras temporada" ✅
- "Por la mañana ves a tu plantilla entrenar, por la noche…" → **adaptado**: lo ves vía paneles + mensajes del staff, no visualmente
- "Descubres que la sal en las patatas vende más cervezas" ✅ (cascadas siguen siendo el corazón)
- "Tú, no solo tu club, eres ahora alguien" ✅ (Manager-RPG es Pilar 3)

**Core fantasy diferida** a v1.1+:
- "Ves crecer el imperio ladrillo a ladrillo, jugador a jugador, comercio a comercio" ❌ MVP (es Pilar B)
- "Las luces del estadio nuevo iluminan una ciudad que ya no cabe en sí misma" ❌ MVP
- "Una IA local genera la voz del mundo (prensa, rumores, llamadas)" ❌ MVP (es Pilar D)

**Hipótesis bajo test en MVP**: el loop *decisión → cascada → resultado → mensaje del staff → siguiente decisión* es intrínsecamente satisfactorio sin la capa visual del crecimiento de la ciudad y sin la voz narrativa de la IA. Si esta hipótesis falla en el vertical slice, replantear scope antes de gastar en v1.1.

**Anti-pillars preservadas** (de game-concept.md):
- "Calm Is The Tempo" ✅ (más fuerte en DOM, sin spectacle visual)
- "Discovery, not Exposure" ✅ (cascadas siguen ocultas)

---

## 3. Detailed Rules — In / Out

### 3.1 Pillars

| Pillar | Status | Sistema(s) núcleo |
|---|---|---|
| **A. Soccer Manager** (match sim + cascadas + economía) | ✅ **MVP** | match-simulation, cascade-engine, economy |
| **B. Mundo Isométrico Vivo** (city builder + state variants) | ❌ **v1.1+** | city-progression, isometric-world |
| **C. Manager-RPG** (progresión personal del jugador) | ✅ **MVP** | manager-rpg, staff-system |
| **D. IA Narrativa Local** (llama.cpp) | ❌ **v1.1+** | narrative-ai |

### 3.2 System GDDs

**IN MVP (8 GDDs a escribir)**:
| Layer | GDD | Razón |
|---|---|---|
| Foundation | `cascade-engine.md` | Corazón Pilar A; define NodeId catalog |
| Foundation | `match-simulation.md` | Sin esto, no hay partido |
| Foundation | `economy.md` | Cascadas necesitan substrato económico (fan_momentum, finanzas club) |
| Core | `manager-rpg.md` | Pilar C |
| Core | `staff-system.md` | Bound a Manager-RPG (calidad staff = granularidad de mensajes); también es la capa de feedback que hace el loop satisfactorio antes de comprender el sistema |
| Feature | `event-system.md` | Eventos calendarizados/random; pre-aviso staff |
| Feature | `league-system.md` | Sin liga, no hay temporada |
| Presentation | `hud-ui.md` | **Variante DOM-only** — listas/paneles/tablas, sin canvas |

**DEFERRED a v1.1+ (3 GDDs no escritos en MVP)**:
| Layer | GDD | Defer-to |
|---|---|---|
| Core | `city-progression.md` | v1.1 |
| Feature | `narrative-ai.md` | v1.2 (spike llama.cpp pendiente) |
| Presentation | `isometric-world.md` | v1.1 |

### 3.3 ADRs — re-clasificación

| ADR | MVP relevance | Acción |
|---|---|---|
| ADR-001 (Web stack) | ✅ MVP | Sin cambios |
| ADR-002 (Determinismo) | ✅ MVP | Sin cambios |
| ADR-003 (Cascade graph) | ✅ MVP | Sin cambios |
| **ADR-004** (Narrative AI / llama.cpp) | ❌ v1.1+ | Marcar status "Accepted (deferred — MVP no implementation)" — spike OQ1 puede esperar |
| ADR-005 (WorldState persistence) | ✅ MVP | Sin cambios; WorldState es agnóstico al rendering |
| **ADR-006** (PixiJS isometric) | ❌ v1.1+ | Marcar "Accepted (deferred)" — TR3 mobile spike no bloqueante para MVP |
| ADR-007 (Sport-agnostic match) | ✅ MVP | Sin cambios |
| ADR-008 (World Clock + Event Loop) | ✅ MVP | Sin cambios |
| ADR-009 (Staff Message Routing) | ✅ MVP | Sin cambios |
| ADR-010 (Manager-RPG Progression) | ✅ MVP | Sin cambios |
| ADR-011 (League Schema) | ✅ MVP | Sin cambios |
| **ADR-012** (UI Architecture DOM↔Canvas) | ⚠️ MVP-simplified | Para MVP: solo lado DOM aplica. Canvas frontier queda documentada para v1.1+ |

### 3.4 Art bible & assets

- **Art bible** (`design/art/art-bible.md`): permanece como pre-inversión completa. **No se revisa, no se descarta.** Tile size 32×16 sigue locked.
- **Validation prototype** (`prototypes/cascada-art-bible-validation/`): permanece como referencia v1.1+. La validación visual pendiente del usuario sigue siendo útil cuando se reactive el pillar.
- **Asset production**: 0 sprites de tile/edificio/personaje se producen para MVP. Único trabajo visual MVP: **design tokens de DOM** (paleta, tipografía, spacing, iconos UI) — ver sección hud-ui.md cuando se escriba.
- **Pilar 2 ("World Is The Scoreboard") en MVP**: representado **textualmente** — el estado del mundo se proyecta en paneles de staff (estadio decrépito ↔ moderno, ciudad fantasma ↔ vibrante) sin renderizado.

### 3.5 Prototype trace

- `prototypes/cascada-engine-concept/` → PROCEED del concepto general, sigue válido para MVP.
- `prototypes/cascada-art-bible-validation/` → diferido a cuando se reactive Pillar B (v1.1+).
- Próximo prototype recomendado: **vertical slice DOM-only** del loop *cascada → staff message → decisión* tras 2 system GDDs.

---

## 4. Formulas — Scope Math

### 4.1 Producer capacity model (Pre-Production gate 2026-05-16)

```
Available_days     = 4 a 6 months × 20 productive_days/month = 80–120 days
Pillars_4          = Available_days / 4 = 20–30 days/pillar  (NO VIABLE)
Pillars_2 (cut)    = Available_days / 2 = 40–60 days/pillar  (VIABLE)
```

### 4.2 GDD authoring cost (estimación)

```
GDD_cost_per_system        = 2–4 days (incluyendo /design-review)
GDDs_MVP                   = 8
GDD_authoring_total        = 16–32 days
GDD_savings_vs_4_pillars   = (11 - 8) × 3 = ~9 days saved
```

(El ahorro real no es la escritura del GDD — es no implementar 3 sistemas + sus tests + su contenido + su UI integration.)

### 4.3 Implementation cost (orden de magnitud)

```
Pilar A (Soccer Manager core)   = ~25–30 days
Pilar C (Manager-RPG)           = ~15–20 days
UI MVP (DOM)                    = ~10–15 days
Content (1 league, 16 clubs, ~250 players, balance pass) = ~10 days
Testing + vertical slice + polish = ~15–20 days
─────────────────────────────────────────
TOTAL MVP                       = ~75–95 days
```

Margen sobre los 80–120 days disponibles: **estrecho pero viable**. Si se desbordara, primer corte: reducir contenido (8 clubs en vez de 16, 1 división, menos balance pass).

### 4.4 Variables observables (calibrar tras vertical slice)

- `actual_velocity_days_per_GDD` (después de escribir 2 GDDs, ajustar estimación)
- `vertical_slice_fun_score` (subjetivo + playtest externo: ¿el loop es divertido sin pillares B y D?)
- Si `fun_score < umbral`: replantear scope — añadir pillar B-lite antes de v1.1, o repensar la fantasía.

---

## 5. Edge Cases

### 5.1 "Pero el cascade engine necesita state variants del mundo para ser visible"

**Falso**. La granularidad de feedback de cascadas (ADR-009 Staff Message Routing) ya cubre la visibilidad en texto: `staff.quality × baseThresholdPct` controla qué cambios se reportan al jugador. El mundo visual amplifica el feedback pero no es necesario para que las cascadas sean *percibibles* — solo para que sean *espectaculares*. MVP testea la percepción; v1.1 añade el spectacle.

### 5.2 "Mid-MVP el jugador playtester pide ver el estadio"

**Política**: cualquier feature request que toque Pillar B o D se documenta en `production/scope-creep-log.md` (a crear cuando aparezca el primer item) y se difiere automáticamente. **No se aprueban excepciones durante MVP.** Esto es lo que hace que el scope cut funcione.

### 5.3 "Vertical slice revela que el loop NO es divertido sin Pillar B"

**Trigger de re-evaluación**. Opciones (en orden de preferencia):
1. **Pivot interno**: reforzar staff-system para que los mensajes sean más vívidos (más contenido, no más sistemas).
2. **Pillar B-lite re-entry**: añadir una *single static club view* (escena canvas única con 3-4 state variants en el estadio) — coste estimado ~10 days. Solo si el pivot interno no es suficiente.
3. **Kill MVP**: si el loop fundamentalmente no funciona, abortar y replantear el concepto. (Improbable dado que el prototype `cascada-engine-concept` PROCEED).

### 5.4 "Quiero validar la IA narrativa antes que el resto"

**No durante MVP.** Spike llama.cpp (ADR-004 OQ1) sigue diferido. El argumento: si el loop manager sin AI es divertido, la AI lo amplifica; si no es divertido sin AI, la AI no lo arregla. Validar lo barato primero.

### 5.5 "El art bible queda obsoleto cuando se reactive Pillar B"

**Mitigación**: el art bible incluye fechas y se versiona. Cuando se reactive Pillar B (v1.1), correr `/design-review` sobre el art bible para detectar drift contra decisiones tomadas en MVP (paleta DOM, iconos, design tokens). Hard deadline: tile size NO se cambia (locked 32×16).

---

## 6. Dependencies

### 6.1 Reverse-dependency check (¿algún MVP GDD secretamente requiere un pilar diferido?)

| MVP GDD | Pillar B dep? | Pillar D dep? | Resolución |
|---|---|---|---|
| cascade-engine.md | No | No | Independiente |
| match-simulation.md | No | No | Independiente |
| economy.md | No | No | Independiente |
| manager-rpg.md | No | No | Reputación no necesita visual de ciudad |
| staff-system.md | No | **Sí parcial** | ADR-009 menciona "voz narrativa enriquecida via AI" — degradar a templates fijos en MVP, AI hook como extension point |
| event-system.md | No | **Sí parcial** | Eventos generan flavor text — usar templates en MVP, AI hook como extension point |
| league-system.md | No | No | Tablas de liga son DOM |
| hud-ui.md | **Sí parcial** | No | Versión MVP es DOM-only; canvas hook documentado para v1.1 |

**Conclusión**: 3 GDDs tienen *extension points* hacia pilares diferidos pero ninguno los REQUIERE para funcionar. Diseño es válido.

### 6.2 Forward-dependency (deferred GDDs dependen de MVP work)

- `isometric-world.md` (v1.1) dependerá de: art-bible (ya done) + hud-ui.md (MVP) para el contrato DOM↔Canvas
- `city-progression.md` (v1.1) dependerá de: economy.md (MVP) — tiers de ciudad consumen output del modelo económico
- `narrative-ai.md` (v1.2) dependerá de: staff-system.md (MVP) — AI substituye los templates fijos en los message points

### 6.3 ADR governance durante MVP

- ADR-004, ADR-006 quedan **Accepted (deferred)** — no se modifican; cualquier cambio post-MVP requiere nueva ADR o revisión.
- ADR-012 (UI Architecture) **se mantiene Accepted** pero el control-manifest debe reflejar "MVP usa solo el lado DOM del frontier".

---

## 7. Tuning Knobs — Re-evaluation Triggers

| Knob | MVP default | Re-eval criterion |
|---|---|---|
| Pillar count | 2 | Sólo expandir si vertical slice pasa con `fun_score ≥ umbral` Y velocity actual confirma capacidad |
| GDD wave size | 8 (todos los MVP) | Si tras 2 GDDs la velocity es < estimada, reducir contenido en lugar de cortar GDDs |
| Visual scope | DOM-only | Solo añadir canvas si Edge Case 5.3 dispara |
| AI narrative | Templates fijos | Solo activar tras vertical slice exitoso y spike llama.cpp resuelto |
| Content scope | 1 liga × 16 clubs × ~250 players | Reducir a 1 liga × 8 clubs × ~125 players si velocity se desfasa |
| Mobile PWA | Diferido (target desktop primero) | Activar en Polish phase si bundle/performance lo permite |

### 7.1 v1.1 unlock criteria (cuándo reactivar Pillar B)

ALL de:
- [ ] MVP shipped y estabilizado
- [ ] Playtest data: jugadores piden la "ciudad creciendo" explícitamente (no asumir)
- [ ] Velocity real conocida (estimaciones MVP fueron ±X%)
- [ ] Art bible validation prototype revisado y firmado visualmente

### 7.2 v1.2 unlock criteria (cuándo reactivar Pillar D)

ALL de:
- [ ] v1.1 shipped
- [ ] Spike llama.cpp completado (coste/latencia conocidos)
- [ ] Hosting cost model validado contra revenue
- [ ] Staff-system templates revelan limitaciones que solo AI resuelve

---

## 8. Acceptance Criteria — MVP "Done"

**Funcional**:
- [ ] 8 system GDDs aprobados (lista §3.2)
- [ ] `/create-architecture` → `architecture.md` consolidado para MVP
- [ ] `/create-control-manifest` → `control-manifest.md`
- [ ] Vertical slice REPORT.md con verdict PROCEED
- [ ] 1 liga jugable × 1 temporada completa × 16 clubs
- [ ] Manager-RPG: 5 habilidades funcionales + curva de carrera testeable
- [ ] Staff-system: mensajes contextuales en 3+ tiers de granularidad
- [ ] Determinismo: replay de temporada produce el mismo resultado (test automatizado)

**Producto**:
- [ ] Una partida nueva → primera temporada completable en < 8 horas reales
- [ ] Tutorial mínimo (in-line, no separado)
- [ ] Save/load funcional (cubierto por ADR-005)
- [ ] Performance: < 200ms API, < 500ms loads, sin frame drops en DOM

**Calidad**:
- [ ] `/gate-check pre-production` PASS (los 8 blockers del 2026-05-16 cerrados)
- [ ] `/balance-check` PASS — no dominant strategies
- [ ] Playtest externo ≥ 3 testers, retention day-2 ≥ 50%
- [ ] WCAG 2.1 AA cumplido (axe-core + Lighthouse ≥ 90 en CI)

**Stage advancement**: con todos los acceptance criteria cumplidos, `stage.txt` avanza de Concept → Systems Design directamente al revisar `/gate-check`. Sistema de stages se actualiza tras vertical slice + gate pass, no antes.

---

## 9. Open Questions

| ID | Pregunta | Bloqueante para | Owner |
|----|----------|-----------------|-------|
| SCO-1 | ¿Confirmar 1 liga × 16 clubs vs reducción a 8? | league-system.md GDD | User + game-designer |
| SCO-2 | ¿Qué constituye "umbral de fun_score" en Edge Case 5.3? | Vertical slice eval | Producer + user |
| SCO-3 | ¿Definir formalmente el template engine que substituye llama.cpp en MVP (string interpolation, fragments, etc.)? | staff-system.md, event-system.md | web-backend-specialist |
| SCO-4 | ¿El "scope-creep-log.md" requiere proceso formal o basta append-only? | Cuando aparezca primer item | Producer |

---

## 10. Decisions Log

| Date | Decision | Rationale | Decided by |
|------|----------|-----------|------------|
| 2026-05-16 | Gate Pre-Production FAIL acceptado; scope cut DEFERRED | User quería completar art bible primero | User |
| 2026-05-17 | Cortar a 2 pilares: A (Soccer Manager) + C (Manager-RPG) | Producer rec confirmada; viabilidad solo dev 4-6mo | User |
| 2026-05-17 | DOM-only para MVP (corte limpio del Pillar B) | Sin medio-camino; testear hipótesis del loop antes de gastar visual capital | User |
| 2026-05-17 | Art bible y validation prototype NO se descartan, quedan como pre-inversión v1.1+ | Investment-already-made; tile size 32×16 locked | User |

---

## 11. Cross-references

- `design/gdd/game-concept.md` — concepto original 4-pillar (este doc lo supersedes en scope MVP)
- `design/gdd/systems-index.md` — actualizar con tags [MVP] / [v1.1+] (pendiente, task #2)
- `design/art/art-bible.md` — pre-inversión válida para v1.1+
- `production/gate-checks/pre-prod-2026-05-16.md` — Producer NOT READY que motivó esta decisión
- `docs/architecture/architecture-review-2026-05-16.md` — base arquitectónica que sigue válida
- ADRs 001–012 — todos siguen Accepted; 004, 006 etiquetados deferred-implementation
