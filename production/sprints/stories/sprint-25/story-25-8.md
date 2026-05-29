# 25-8 — GDPR data-export endpoint (`/me/export`)

**Sprint:** 25 | **Owner:** web-backend | **Est:** 0.5d | **Dependencies:** — | **Status:** Complete (2026-05-29)

## Problem

The `/me/export` endpoint exists in `apps/api/src/modules/me/routes.ts`:

```ts
app.get('/export', requireUser, rateLimit('matchStart'), async (c) => {
  const user = c.get('user');
  const bundle = await Repo.exportUserData(user.id);
  c.header('Content-Disposition', `attachment; filename="export-${user.id}.json"`);
  return c.json(bundle);
});
```

The route is defined but the `Repo.exportUserData` function needs to
actually bundle all user data. This story verifies/implements the
data export and ensures it works end-to-end.

## Acceptance Criteria

- [ ] `GET /api/me/export` returns a JSON bundle with all user data
- [ ] Bundle includes: user profile, clubs, managers, players, matches, finances
- [ ] Data is comprehensive (covers all tables owned by the user)
- [ ] Rate-limited to prevent abuse
- [ ] Auth middleware protects the endpoint
- [ ] Unit test for export data completeness
- [ ] Privacy page links to the export endpoint

## Implementation Notes

### What exportUserData should include
```ts
// apps/api/src/modules/me/repo.ts
export async function exportUserData(userId: string): Promise<ExportBundle> {
  // 1. Get user's clubs (via manager_clubs)
  // 2. For each club, gather:
  //    - Club info
  //    - Players
  //    - Staff
  //    - Stadium upgrades
  //    - TV contracts
  //    - Sponsors
  //    - Match history (fixtures, results, standings)
  //    - World snapshots (financial history)
  //    - Calendar events
  //    - Milestones
  //    - Manager RPG data
}
```

### Check existing repo
`apps/api/src/modules/me/repo.ts` already has:
- `requestUserDeletion`
- `cancelUserDeletion`
- `executeUserDeletion`
- `getDeletionStatus`

Likely missing: `exportUserData`. Need to check if it exists.

### Key files
- `apps/api/src/modules/me/routes.ts` — route handler (exists)
- `apps/api/src/modules/me/repo.ts` — data access (need to add exportUserData)
