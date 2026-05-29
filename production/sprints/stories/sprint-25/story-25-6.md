# 25-6 — Counter-offer UI flow en /scouting

**Sprint:** 25 | **Owner:** web-frontend | **Est:** 1.0d | **Dependencies:** 25-4 | **Status:** Complete (2026-05-29)

## Problem

The `POST /api/scouting/offer` route exists and returns three outcomes:
- `{ kind: 'accepted', offerId, feeEurK, finalWageEurKWeek }`
- `{ kind: 'counter', offerId, counterOfferEurK }`
- `{ kind: 'rejected', offerId, reason }`

The frontend has no UI to make offers or display counter-offers. The
scouting market shows players but clicking "Make Offer" does nothing
or shows a placeholder.

## Acceptance Criteria

- [ ] /scouting UI has a "Make Offer" button per market player
- [ ] Clicking "Make Offer" opens a modal with fields: fee (€K), wage (€/sem), contract (semanas)
- [ ] Submitting the form calls POST `/api/scouting/offer`
- [ ] Accepted outcome: toast "¡Oferta aceptada!" + player removed from market / moves to squad
- [ ] Counter outcome: modal shows counter fee + "Acceptar contraoferta" / "Rechazar" buttons
- [ ] Rejected outcome: toast message with reason ("Oferta rechazada", "Salario bajo")
- [ ] Counter-offer accept/reject calls POST `/api/scouting/respond-offer`
- [ ] Incoming offers (from AI clubs) visible in a tab or section
- [ ] Incoming offers have accept/reject buttons
- [ ] Loading states, error states, validation on form fields

## Implementation Notes

### Current /scouting page
- `apps/web/src/routes/scouting/+page.svelte` — list of market players
- `apps/web/src/routes/scouting/+page.server.ts` — server action for loading

### UI Components needed
- `OfferModal.svelte` — fee/wage/contract form
- `CounterOfferModal.svelte` — shows counter + accept/reject
- `IncomingOffers.svelte` — list of pending incoming offers

### Form action pattern
Follow the existing SvelteKit +page.server.ts pattern:
```ts
export const actions = {
  offer: async (event) => {
    const data = await event.request.formData();
    // call fetch to /api/scouting/offer
  },
};
```

### Key files
- `apps/web/src/routes/scouting/+page.svelte` — current page
- `apps/web/src/routes/scouting/+page.server.ts` — server action
- `apps/api/src/modules/scouting-market/routes.ts` — API endpoints
