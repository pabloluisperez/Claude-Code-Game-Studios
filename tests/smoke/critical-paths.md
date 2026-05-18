# Smoke Test: Critical Paths

**Purpose**: Run these checks in under 15 minutes before any QA hand-off.
**Run via**: `/smoke-check` (which reads this file)
**Update**: Add new entries when new core systems are implemented.
**Last updated**: 2026-05-16

## Core Stability (always run)

1. `pnpm install --frozen-lockfile` succeeds without errors
2. `pnpm build` completes for all workspaces (web, api, shared, db)
3. `pnpm --filter @smt/db db:migrate` applies all migrations to a fresh Postgres
4. `pnpm dev` starts both apps (web on :5173, api on :3001) without errors
5. Web app loads `/` (landing page) in browser without console errors
6. API `GET /healthz` returns 200 OK

## Auth Lifecycle (foundation)

7. New user can sign up via `/auth/signup` and is redirected to `/game`
8. Sign-out invalidates the session — protected routes redirect back to `/login`
9. Session cookie survives a page reload (slides expiry; `apps/api/tests/auth.test.ts` covers programmatically)
10. Login with wrong password returns 401 with no information leak

## Core Mechanic (update per sprint)

<!-- Add the primary mechanic for each sprint here as it is implemented -->
<!-- Examples (post-MVP-foundation):                                                 -->
<!--   "POST /api/game/advance with currentWeek=1 + a match at week=3 returns        -->
<!--    finalWeek=3 and eventsTriggered includes the match"                          -->
<!--   "Save game survives full page reload (autosave snapshot restored)"             -->
11. [Primary mechanic — fill when first core system epic begins]

## Data Integrity

12. WorldState autosave round-trip: advance once, reload page, currentWeek matches
13. No PII or session tokens appear in client-bundle source maps (check production build)

## Performance Smoke

14. `/game` route initial JS payload under the 500kb budget (verify with `pnpm build` analyser)
15. PixiJS canvas reaches 60fps idle on mid-range desktop (DevTools FPS meter, 10s sample)

## Determinism Smoke

16. `pnpm --filter @smt/shared test` passes — sim determinism tests with fixed seeds produce identical golden output
