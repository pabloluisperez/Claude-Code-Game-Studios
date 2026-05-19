/**
 * Pure event resolver — dispatches `EventDecisionPayload` + choice → deltas + side effects.
 *
 * Per ADR-015 §Resolver Function:
 *   - Exhaustive over the discriminated union (TS `never` check).
 *   - Pure: no Math.random(), no Date.now(); rng via ctx.rng() if needed.
 *   - JSON-serialisable outputs only.
 *
 * Each variant has a dedicated `resolveX` function. Adding a new variant forces
 * 3 places to update (union, switch, handler) — TS will fail to compile.
 *
 * Story: EVENT-SYSTEM-003/004 (TR-EVT-003/004)
 * Control Manifest: 2026-05-19
 */

import type {
  BoardMeetingCrisisPayload,
  BoardMeetingQuiebraPayload,
  ContractRenewalOfferPayload,
  CorruptionCaughtPayload,
  EventChoiceId,
  EventDecisionPayload,
  NominaFrozenOfferPayload,
  ResolutionResult,
  ScandalResponsePayload,
  SideEffect,
  SponsorOfferPayload,
  SponsorRenewalPayload,
  StadiumUpgradeOfferPayload,
  TransferOfferPayload,
  YouthPromotionPayload,
  ExternalManagerOfferPayload,
  AlcaldeMeetingPayload,
} from './types.js';

export interface EventResolveContext {
  readonly rng: () => number;
  readonly currentWeek: number;
  readonly playerClubId: string;
}

const EMPTY: ResolutionResult = Object.freeze({ deltas: {}, sideEffects: [] });

/** Build a resolution result with shallow defaults. */
function result(
  deltas: Readonly<Record<string, number>> = {},
  sideEffects: readonly SideEffect[] = [],
): ResolutionResult {
  return { deltas, sideEffects };
}

// ── Per-variant resolvers ─────────────────────────────────────────────────────

function resolveBoardCrisis(
  payload: BoardMeetingCrisisPayload,
  choice: EventChoiceId<BoardMeetingCrisisPayload>,
): ResolutionResult {
  switch (choice) {
    case 'accept_freeze':
      return result({}, [{ kind: 'spawn_event', payload: { kind: 'nomina_frozen_offer' } }]);
    case 'sell_player':
      return result({}, [{ kind: 'flag_player_for_sale' }]);
    case 'request_loan':
      // Loan: +50€K immediate, -5€K/wk for 20 weeks (tracked via counter)
      return result(
        { financial_balance: +50 },
        [{ kind: 'apply_loan', payload: { weeklyEurK: -5, durationWeeks: 20 } }],
      );
    default: {
      const _ex: never = choice;
      void _ex;
      return EMPTY;
    }
  }
}

function resolveBoardQuiebra(
  payload: BoardMeetingQuiebraPayload,
  choice: EventChoiceId<BoardMeetingQuiebraPayload>,
): ResolutionResult {
  switch (choice) {
    case 'fire_sale':
      // Flag top 3 players to sell; balance bump applied when sales close
      return result({}, [{ kind: 'flag_player_for_sale', payload: { count: 3, byRating: 'top' } }]);
    case 'accept_takeover':
      // -25 reputation handled via manager-rpg event; sponsor signed via side effect
      return result(
        { sponsor_quality: +30 },
        [{ kind: 'sign_sponsor', payload: { source: 'takeover', amount: 15 } }],
      );
    case 'resign':
      return result({}, [{ kind: 'end_playthrough', payload: { reason: 'resigned' } }]);
    default: {
      const _ex: never = choice;
      void _ex;
      return EMPTY;
    }
  }
}

function resolveNominaFrozen(
  payload: NominaFrozenOfferPayload,
  choice: EventChoiceId<NominaFrozenOfferPayload>,
): ResolutionResult {
  if (choice === 'freeze') {
    // -15 player_happiness immediate; freeze counter set
    return result({ player_happiness: -15 }, [
      { kind: 'set_counter', payload: { name: 'nomina_frozen_weeks_remaining', value: 8 } },
    ]);
  }
  return EMPTY;
}

function resolveSponsorOffer(
  payload: SponsorOfferPayload,
  choice: EventChoiceId<SponsorOfferPayload>,
): ResolutionResult {
  if (choice === 'accept') {
    return result(
      { sponsor_quality: payload.qualityDelta },
      [
        {
          kind: 'sign_sponsor',
          payload: {
            brand: payload.brand,
            weeklyEurK: payload.weeklyAmountEurK,
            contractWeeks: payload.contractWeeks,
            qualityContribution: payload.qualityDelta,
          },
        },
      ],
    );
  }
  return EMPTY;
}

function resolveSponsorRenewal(
  payload: SponsorRenewalPayload,
  choice: EventChoiceId<SponsorRenewalPayload>,
): ResolutionResult {
  if (choice === 'renew') {
    return result({}, [
      {
        kind: 'sign_sponsor',
        payload: {
          brand: payload.currentBrand,
          weeklyEurK: payload.proposedWeeklyAmountEurK,
          contractWeeks: payload.proposedContractWeeks,
        },
      },
    ]);
  }
  // Decline: sponsor_quality drops + cancel
  return result({ sponsor_quality: -20 }, [
    { kind: 'cancel_sponsor', payload: { brand: payload.currentBrand, reason: 'declined' } },
  ]);
}

function resolveScandalResponse(
  payload: ScandalResponsePayload,
  choice: EventChoiceId<ScandalResponsePayload>,
): ResolutionResult {
  if (choice === 'cooperate') {
    // Flat 30€K fine per ADR-015 W-05 closure
    return result({ financial_balance: -30 });
  }
  // Deny: gamble — could escalate to public scandal (handled by event-system follow-up)
  return result({ corruption_exposure: +15 });
}

function resolveCorruptionCaught(
  payload: CorruptionCaughtPayload,
  choice: EventChoiceId<CorruptionCaughtPayload>,
): ResolutionResult {
  if (choice === 'accept_consequences') {
    return result(
      { fan_momentum: -25 },
      [{ kind: 'cancel_sponsor', payload: { reason: 'scandal_all' } }],
    );
  }
  // Bribe: tactical — exposure drops to 60 (still risky), -80€K cost
  return result({ corruption_exposure: -20, financial_balance: -80 });
}

function resolveTransferOffer(
  payload: TransferOfferPayload,
  choice: EventChoiceId<TransferOfferPayload>,
): ResolutionResult {
  if (choice === 'accept') {
    return result({ financial_balance: payload.offerEurK }, [
      {
        kind: 'transfer_player',
        payload: { playerId: payload.playerId, toClubId: payload.fromClubId, priceEurK: payload.offerEurK },
      },
    ]);
  }
  // Reject or counter — caller follows up with a fresh event
  return EMPTY;
}

function resolveContractRenewal(
  payload: ContractRenewalOfferPayload,
  choice: EventChoiceId<ContractRenewalOfferPayload>,
): ResolutionResult {
  if (choice === 'accept') {
    return result({}, [
      {
        kind: 'spawn_event',
        payload: { kind: 'contract_renewal_accepted', playerId: payload.playerId, salaryEurK: payload.proposedSalaryEurK },
      },
    ]);
  }
  return EMPTY;
}

function resolveYouthPromotion(
  payload: YouthPromotionPayload,
  choice: EventChoiceId<YouthPromotionPayload>,
): ResolutionResult {
  if (choice === 'promote') {
    return result({}, [{ kind: 'mark_player_promoted', payload: { playerId: payload.playerId } }]);
  }
  return EMPTY;
}

function resolveAlcaldeMeeting(
  payload: AlcaldeMeetingPayload,
  choice: EventChoiceId<AlcaldeMeetingPayload>,
): ResolutionResult {
  if (choice === 'accept_offer') {
    return result({}, [{ kind: 'end_playthrough', payload: { reason: 'accepted_external_offer' } }]);
  }
  // Decline variants — no deltas (reputation grant via manager-rpg events upstream)
  return EMPTY;
}

function resolveExternalManagerOffer(
  payload: ExternalManagerOfferPayload,
  choice: EventChoiceId<ExternalManagerOfferPayload>,
): ResolutionResult {
  if (choice === 'accept') {
    return result({}, [
      { kind: 'end_playthrough', payload: { reason: 'accepted_external_manager_offer', toClubId: payload.fromClubId } },
    ]);
  }
  return EMPTY;
}

function resolveStadiumUpgrade(
  payload: StadiumUpgradeOfferPayload,
  choice: EventChoiceId<StadiumUpgradeOfferPayload>,
): ResolutionResult {
  if (choice === 'accept') {
    return result({
      financial_balance: -payload.costEurK,
      stadium_capacity: payload.proposedCapacityIncrease,
    });
  }
  return EMPTY;
}

// ── Top-level dispatcher (exhaustive over the union) ─────────────────────────

export function resolveEvent(
  payload: EventDecisionPayload,
  choice: string,
  _ctx: Readonly<EventResolveContext>,
): ResolutionResult {
  switch (payload.kind) {
    case 'board_meeting_crisis':
      return resolveBoardCrisis(payload, choice as EventChoiceId<BoardMeetingCrisisPayload>);
    case 'board_meeting_quiebra':
      return resolveBoardQuiebra(payload, choice as EventChoiceId<BoardMeetingQuiebraPayload>);
    case 'nomina_frozen_offer':
      return resolveNominaFrozen(payload, choice as EventChoiceId<NominaFrozenOfferPayload>);
    case 'sponsor_offer':
      return resolveSponsorOffer(payload, choice as EventChoiceId<SponsorOfferPayload>);
    case 'sponsor_renewal':
      return resolveSponsorRenewal(payload, choice as EventChoiceId<SponsorRenewalPayload>);
    case 'scandal_response':
      return resolveScandalResponse(payload, choice as EventChoiceId<ScandalResponsePayload>);
    case 'corruption_caught':
      return resolveCorruptionCaught(payload, choice as EventChoiceId<CorruptionCaughtPayload>);
    case 'transfer_offer':
      return resolveTransferOffer(payload, choice as EventChoiceId<TransferOfferPayload>);
    case 'contract_renewal_offer':
      return resolveContractRenewal(payload, choice as EventChoiceId<ContractRenewalOfferPayload>);
    case 'youth_promotion':
      return resolveYouthPromotion(payload, choice as EventChoiceId<YouthPromotionPayload>);
    case 'alcalde_meeting':
      return resolveAlcaldeMeeting(payload, choice as EventChoiceId<AlcaldeMeetingPayload>);
    case 'external_manager_offer':
      return resolveExternalManagerOffer(payload, choice as EventChoiceId<ExternalManagerOfferPayload>);
    case 'stadium_upgrade_offer':
      return resolveStadiumUpgrade(payload, choice as EventChoiceId<StadiumUpgradeOfferPayload>);
    default: {
      const _exhaustive: never = payload;
      void _exhaustive;
      throw new Error(`Unhandled event kind: ${(payload as { kind: string }).kind}`);
    }
  }
}

/** Resolve via the payload's default option (used on timeout). */
export function resolveDefault(
  payload: EventDecisionPayload,
  ctx: Readonly<EventResolveContext>,
): ResolutionResult {
  return resolveEvent(payload, payload.defaultOption, ctx);
}
