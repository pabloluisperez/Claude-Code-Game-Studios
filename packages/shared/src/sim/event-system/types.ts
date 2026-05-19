/**
 * Event-system types — per ADR-015 §TypeScript Schema.
 *
 * Discriminated union over all MVP event variants. Each variant carries:
 *   - kind (string literal discriminant)
 *   - options (typed choice map)
 *   - defaultOption (the optionId applied on timeout)
 *
 * All payloads must JSON round-trip cleanly (no Map, no Date, no functions).
 *
 * Story: EVENT-SYSTEM-002/003 (TR-EVT-002/003)
 * Control Manifest: 2026-05-19
 */

export type EventPriority = 'STOP' | 'ADVISORY' | 'NOTIFY';

export interface EventOption {
  readonly label: string;
  readonly description: string;
}

// ── Variant payloads ──────────────────────────────────────────────────────────

export interface BoardMeetingCrisisPayload {
  readonly kind: 'board_meeting_crisis';
  readonly reason: 'financial_crisis';
  readonly options: {
    readonly accept_freeze: EventOption;
    readonly sell_player: EventOption;
    readonly request_loan: EventOption;
  };
  readonly defaultOption: 'request_loan';
}

export interface BoardMeetingQuiebraPayload {
  readonly kind: 'board_meeting_quiebra';
  readonly reason: 'financial_collapse';
  readonly options: {
    readonly fire_sale: EventOption;
    readonly accept_takeover: EventOption;
    readonly resign: EventOption;
  };
  readonly defaultOption: 'accept_takeover';
}

export interface NominaFrozenOfferPayload {
  readonly kind: 'nomina_frozen_offer';
  readonly options: {
    readonly freeze: EventOption;
    readonly refuse: EventOption;
  };
  readonly defaultOption: 'refuse';
}

export interface SponsorOfferPayload {
  readonly kind: 'sponsor_offer';
  readonly brand: string;
  readonly weeklyAmountEurK: number;
  readonly contractWeeks: number;
  readonly qualityDelta: number;
  readonly options: {
    readonly accept: EventOption;
    readonly reject: EventOption;
  };
  readonly defaultOption: 'reject';
}

export interface SponsorRenewalPayload {
  readonly kind: 'sponsor_renewal';
  readonly currentBrand: string;
  readonly proposedWeeklyAmountEurK: number;
  readonly proposedContractWeeks: number;
  readonly options: {
    readonly renew: EventOption;
    readonly decline: EventOption;
  };
  readonly defaultOption: 'renew';
}

export interface ScandalResponsePayload {
  readonly kind: 'scandal_response';
  readonly scandalType: 'tax_evasion' | 'corruption' | 'misconduct';
  readonly severity: 'minor' | 'major';
  readonly options: {
    readonly cooperate: EventOption;
    readonly deny: EventOption;
  };
  readonly defaultOption: 'cooperate';
}

export interface CorruptionCaughtPayload {
  readonly kind: 'corruption_caught';
  readonly exposureLevel: number;
  readonly options: {
    readonly accept_consequences: EventOption;
    readonly bribe_officials: EventOption;
  };
  readonly defaultOption: 'accept_consequences';
}

export interface TransferOfferPayload {
  readonly kind: 'transfer_offer';
  readonly playerId: string;
  readonly fromClubId: string;
  readonly offerEurK: number;
  readonly options: {
    readonly accept: EventOption;
    readonly reject: EventOption;
    readonly counter: EventOption & { readonly counterEurK?: number };
  };
  readonly defaultOption: 'reject';
}

export interface ContractRenewalOfferPayload {
  readonly kind: 'contract_renewal_offer';
  readonly playerId: string;
  readonly playerName: string;
  readonly age: number;
  readonly currentSalaryEurK: number;
  readonly proposedSalaryEurK: number;
  readonly proposedContractWeeks: number;
  readonly options: {
    readonly accept: EventOption;
    readonly decline: EventOption;
    readonly counter: EventOption & { readonly counterSalaryEurK?: number };
  };
  readonly defaultOption: 'decline';
}

export interface YouthPromotionPayload {
  readonly kind: 'youth_promotion';
  readonly playerId: string;
  readonly potentialRating: number;
  readonly options: {
    readonly promote: EventOption;
    readonly keep_youth: EventOption;
  };
  readonly defaultOption: 'keep_youth';
}

export interface AlcaldeMeetingPayload {
  readonly kind: 'alcalde_meeting';
  readonly city: string;
  readonly fromClubId: string;
  readonly jobTier: 1 | 2 | 3;
  readonly options: {
    readonly accept_offer: EventOption;
    readonly polite_decline: EventOption;
    readonly rude_decline: EventOption;
  };
  readonly defaultOption: 'polite_decline';
}

export interface ExternalManagerOfferPayload {
  readonly kind: 'external_manager_offer';
  readonly fromClubId: string;
  readonly divisionTier: 1 | 2;
  readonly options: {
    readonly accept: EventOption;
    readonly decline: EventOption;
  };
  readonly defaultOption: 'decline';
}

export interface StadiumUpgradeOfferPayload {
  readonly kind: 'stadium_upgrade_offer';
  readonly proposedCapacityIncrease: number;
  readonly costEurK: number;
  readonly options: {
    readonly accept: EventOption;
    readonly defer: EventOption;
  };
  readonly defaultOption: 'defer';
}

export type EventDecisionPayload =
  | BoardMeetingCrisisPayload
  | BoardMeetingQuiebraPayload
  | NominaFrozenOfferPayload
  | SponsorOfferPayload
  | SponsorRenewalPayload
  | ScandalResponsePayload
  | CorruptionCaughtPayload
  | TransferOfferPayload
  | ContractRenewalOfferPayload
  | YouthPromotionPayload
  | AlcaldeMeetingPayload
  | ExternalManagerOfferPayload
  | StadiumUpgradeOfferPayload;

export type EventChoiceId<P extends EventDecisionPayload> = keyof P['options'] & string;

// ── Resolver outputs ──────────────────────────────────────────────────────────

export interface SideEffect {
  readonly kind:
    | 'spawn_event'
    | 'set_counter'
    | 'flag_player_for_sale'
    | 'transfer_player'
    | 'cancel_sponsor'
    | 'sign_sponsor'
    | 'end_playthrough'
    | 'apply_loan'
    | 'mark_player_promoted';
  readonly payload?: Record<string, unknown>;
}

export interface ResolutionResult {
  /** Partial WorldState delta to apply via cascade Step 3. */
  readonly deltas: Readonly<Record<string, number>>;
  /** Side effects executed by the caller (DB writes, follow-up events, etc.). */
  readonly sideEffects: readonly SideEffect[];
}
