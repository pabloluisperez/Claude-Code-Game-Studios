# Tech Debt Register

> Maintained by `/tech-debt` skill + ad-hoc additions during overnight sessions.
> Format: one entry per row in the table below, plus a detail block per entry.

| ID | Date | Category | Severity | File / Area | Title | Status |
|----|------|----------|----------|-------------|-------|--------|
| TD-001 | 2026-05-21 | Dependency / Type | Low | `apps/api/src/server.ts:47` | Hono+Node 26 Http2Server vs Server typing mismatch | ✅ Resolved 2026-05-21 (Sprint 7) |

---

## TD-001 — Hono+Node 26 Http2Server vs Server typing mismatch

**Date filed**: 2026-05-21 (during overnight Path B closure)
**Category**: Dependency Debt — upstream typing issue between Hono's Node serve adapter and Node 26's typings
**Severity**: Low — runtime-safe, no functional impact; only `svelte-check` / `tsc` emits the error
**Location**: `apps/api/src/server.ts:47:22`

### The error

```
ERROR "../api/src/server.ts" 47:22
Argument of type 'ServerType' is not assignable to parameter of type
'Server<typeof IncomingMessage, typeof ServerResponse>'.
  Type 'Http2Server<typeof IncomingMessage, typeof ServerResponse,
    typeof Http2ServerRequest, typeof Http2ServerResponse>' is missing the
    following properties from type 'Server<typeof IncomingMessage,
    typeof ServerResponse>':
    maxHeadersCount, maxRequestsPerSocket, timeout, headersTimeout, and 5 more.
```

### Context

`@hono/node-server` returns a `ServerType` union that includes both HTTP/1.1
`Server` and HTTP/2 `Http2Server`. Node 26 tightened the typings so the union
no longer narrows automatically in all consumer contexts. The code in
`server.ts:47` passes this to something that requires the narrower `Server`.

The runtime behavior is unaffected — the server starts and serves correctly.
The error is purely at the TypeScript type level.

### Why filed (not fixed)

This was discovered during `/gate-check pre-production` (2026-05-21).
The fix involves either:

1. Asserting the type narrow at the call site: `serve(...) as Server`
2. Upgrading `@hono/node-server` to a version with corrected typings (if released)
3. Switching to a different adapter that exposes the correct narrow type

Each option requires either tolerating a type-cast (option 1) or verifying
no regression in HTTP/2 path support (option 2-3). Not a Production-entry
blocker per gate verdict.

### Suggested scheduling

Production Sprint 7 polish window. Estimated effort: 30 min if option 1
(targeted cast); 1-2 hours if option 2 (upgrade + verify) requires testing.

### Workaround

Currently the build passes via `vitest run` (which doesn't run `tsc --noEmit`
on this file). The `pnpm test` script in @smt/shared chains `tsc --noEmit`
and was fixed separately for that package (commit `1fd54f8` — `exactOptionalPropertyTypes`
widening for QuickMatchEvent and MatchEvent). The api package's test script
does not currently invoke `tsc --noEmit` so CI does not block on this error.
The error only surfaces when running `svelte-check` from the web package
which transitively imports api types.

### Resolution criteria

- `cd apps/web && npx svelte-check --threshold error` returns 0 errors.
- No new error introduced in any other consumer of the api package's exports.
- Runtime smoke (`pnpm dev` + manual HTTP request) still works.

### Resolution (2026-05-21 — Sprint 7 task 7-4)

**Fix**: Widened the `createSocketServer` parameter type in `apps/api/src/socket/index.ts:14` from `httpServer: HttpServer` to `httpServer: HttpServer | Http2Server`. Socket.IO 4.x natively supports both server types, so no runtime change was needed — only the TypeScript signature.

**Verification**:
- `cd apps/web && npx svelte-check --threshold error` → 0 errors (was 1).
- `@smt/api` vitest: 32 tests passing (4 files, no regression).
- No call-site cast at `apps/api/src/server.ts:47` required — the widening at the consumer is the cleanest possible fix.

**Commit**: see Sprint 7 commit log for the resolution change.
