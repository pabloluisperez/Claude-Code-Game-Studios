# Web Game Patterns

Patterns that apply to most browser-based games regardless of genre.
Reference this when designing persistence, save games, authority,
canvas rendering, and anti-cheat.

> **Last verified:** 2026-05-15

## Authority Models

| Model | Description | Use when |
|-------|-------------|----------|
| **Server-authoritative** | Server holds truth; clients send intents. | Anything with stakes (multiplayer, economy, leaderboards, persistent progression) — **default** |
| **Client-authoritative** | Client computes outcomes; server stores. | Strictly single-player offline games, demos, prototypes |
| **Hybrid** | Client predicts for responsiveness; server reconciles. | Real-time action with latency tolerance |

The web template defaults to **server-authoritative**. Client prediction
is added per-feature, not globally.

## Persistence Tiers

| Tier | Storage | Lifetime | Use for |
|------|---------|----------|---------|
| **In-memory (client)** | Component state | Page lifetime | UI state, transient modals |
| **`sessionStorage`** | Browser | Tab lifetime | Form drafts, "back" recovery |
| **`localStorage`** | Browser | Until cleared | Theme, UI preferences, accessibility settings |
| **IndexedDB** | Browser | Until cleared | Asset cache, large client-side data (rare for server-authoritative games) |
| **PostgreSQL** | Server | Persistent | Authoritative game state, accounts, history — **default** |
| **Redis** | Server | TTL or persistent | Ephemeral state (presence, match locks, rate limits) |

**Rule**: nothing that affects gameplay outcomes lives only on the client.

## Save Game Models

| Model | Description | When |
|-------|-------------|------|
| **Single autosave** | One slot per user, server-side, continuous | Persistent worlds, management games |
| **Multi-slot manual** | User chooses save slot, named slots | Story games, branching paths |
| **Snapshot + delta** | Periodic full snapshot + change log | Long sessions, undo/redo, debugging |
| **No save** | Pure session play | Arcade, daily challenges |

For management/manager-style games: **single autosave per user per
playthrough**, with the playthrough as a row in `playthroughs` table and
the world state across child tables.

## Turn vs Tick vs Real-time

| Mode | Loop | Communication |
|------|------|---------------|
| **Pure turn-based** | Wait for player input → advance | HTTP POST per turn |
| **Tick-based** | Fixed cadence (daily, hourly) | Server cron + Socket.IO notification |
| **Soft real-time** | Continuous but tolerant (<1s) | Socket.IO events |
| **Hard real-time** | <50ms loop | Native engine, not this stack |

Management/manager games are usually **tick-based** (a "day" = a game day)
with **soft real-time** for live events (match ticker, market actions).

## Deterministic Simulation

Game logic that runs as simulation (matches, economy ticks, season advance)
must be deterministic:

1. **Single RNG source** seeded explicitly. Use `seedrandom` or hash-based PRNG.
2. **No `Date.now()`** inside sim logic — pass the world clock as input.
3. **No `Math.random()`** — only the seeded RNG.
4. **No async I/O** during sim — load state first, simulate pure, persist after.
5. **Stable iteration order** — `Map` and `Set` preserve insertion order; rely on it.

Determinism enables:
- Replays (re-run from seed + initial state)
- Debugging (reproduce exact bug)
- Optional client preview (same code, same input, same output)
- Migration testing (run sim on old + new code, diff outputs)

Place all sim logic in `packages/shared/sim/`.

## Anti-Cheat (Lightweight)

Browser games can't prevent client tampering. Defense in depth:

| Layer | Practice |
|-------|----------|
| **Server validates everything** | Every mutation goes through Zod + business rules |
| **No client-side balance** | Damage/score/economy formulas live in `packages/shared/sim/`, executed only on server for authoritative outcomes |
| **Idempotency keys** | Mutations include client-generated IDs; server dedups |
| **Rate limits** | Per-user, per-action, in Redis |
| **Audit log** | Every state change written to `audit_events` table |
| **Anomaly detection** | Off-line job flags impossible state transitions |

**Do not** ship anti-debug, code obfuscation, or browser fingerprinting
in a hobbyist project. They give false confidence and break legitimate
users (assistive tech, ad blockers).

## Bundle and Loading

- Initial route bundle: target **<300 KB gzipped**
- PixiJS, Chart.js, heavy data libs: lazy-load on route
- Images via `<picture>` with AVIF/WebP fallback; use Vite's `import.meta.glob` for asset manifests
- Fonts: subset to used glyphs; preload critical weights

## Responsive Design

| Form factor | Constraints |
|-------------|-------------|
| Mobile portrait | One-column, sticky bottom action bar, no canvas (or fullscreen canvas) |
| Tablet | Two-column where it fits, otherwise mobile |
| Desktop | Full layout, sidebars, keyboard shortcuts |

Use Tailwind breakpoints (`sm`, `md`, `lg`, `xl`). Don't write custom
media queries unless absolutely necessary.

## Accessibility Baseline

Required for every screen:
- Keyboard navigation (Tab order is logical, focus visible)
- Color contrast AA (Tailwind/DaisyUI defaults pass)
- `prefers-reduced-motion` honored for animations >200ms
- `aria-live="polite"` regions for live updates (match ticker, toasts)
- Screen-reader-only labels for icon-only buttons (`sr-only` class)

Optional but recommended for v1:
- Colorblind-safe palette (DaisyUI's `corporate` or `business` themes)
- Adjustable font size

## i18n (Future-proofing)

Even if you ship in one language, structure for translation:
- All user-facing strings via a `t('key')` helper, not hard-coded
- Use `paraglide` or `svelte-i18n` (allowed libraries)
- Keep keys flat (`match.kickoff`, not `match.events.kickoff.label`) for translator sanity

## Offline / Network Loss

For games that should tolerate a flaky connection:
- Optimistic UI for low-stakes actions (UI updates, then reconciles on server response)
- Queue commands locally during outage; replay on reconnect with idempotency keys
- Banner indicating offline status; disable destructive actions
- For server-authoritative games: read-only mode is acceptable, write-mode is not

For management games: usually **fail closed** — block actions if the
server is unreachable, since outcomes can't be predicted.

## Canvas Rendering Tips (PixiJS 8)

- One `Application` per gameplay view; tear down on route unmount
- Pool sprites for repeated entities (players on the pitch)
- Use `Container.cacheAsTexture` for static layers (pitch, scoreboard)
- Limit `ticker` work — heavy logic goes in workers, not the render loop
- Cap pixel ratio for retina (`autoDensity: false` if perf suffers)

## Telemetry

Even before formal analytics, emit structured events from the server:

```ts
logger.info({ event: 'match.completed', matchId, homeScore, awayScore, durationMs }, 'event');
```

Pipe to a log aggregator. Build dashboards from these events. Avoid
embedding third-party tracker scripts on the client until necessary.

## Common Anti-Patterns to Avoid

| Anti-pattern | Why it's bad |
|--------------|--------------|
| Client computes match results, server stores | Trivial cheating |
| Sim state in `localStorage` | Lost on cache clear, easy to edit |
| Long-polling for live updates instead of Socket.IO | Wasteful, slow |
| Server-rendered HTML for highly interactive views | Loses SvelteKit's hydration benefits |
| WebGL/PixiJS for static dashboards | Bundle bloat, no benefit |
| One mega `Player` type with 80 fields | Split by concern (`PlayerCore`, `PlayerContract`, `PlayerForm`) |
