/**
 * Unit tests for event resolver (pure dispatcher).
 * Story: EVENT-SYSTEM-003/004
 */

import { describe, it, expect } from 'vitest';
import {
  resolveDefault,
  resolveEvent,
  type EventResolveContext,
} from '../../src/sim/event-system/resolver.js';
import type {
  BoardMeetingCrisisPayload,
  ContractRenewalOfferPayload,
  CorruptionCaughtPayload,
  NominaFrozenOfferPayload,
  ScandalResponsePayload,
  SponsorOfferPayload,
  StadiumUpgradeOfferPayload,
  TransferOfferPayload,
} from '../../src/sim/event-system/types.js';

const ctx: EventResolveContext = {
  rng: () => 0.5,
  currentWeek: 10,
  playerClubId: 'club-1',
};

describe('resolveEvent — board_meeting_crisis', () => {
  const payload: BoardMeetingCrisisPayload = {
    kind: 'board_meeting_crisis',
    reason: 'financial_crisis',
    options: {
      accept_freeze: { label: 'Freeze', description: '' },
      sell_player: { label: 'Sell', description: '' },
      request_loan: { label: 'Loan', description: '' },
    },
    defaultOption: 'request_loan',
  };

  it('test_request_loan_grants_50_eurK', () => {
    const r = resolveEvent(payload, 'request_loan', ctx);
    expect(r.deltas['financial_balance']).toBe(50);
    expect(r.sideEffects.find((s) => s.kind === 'apply_loan')).toBeDefined();
  });

  it('test_accept_freeze_spawns_followup_event', () => {
    const r = resolveEvent(payload, 'accept_freeze', ctx);
    expect(r.sideEffects[0]!.kind).toBe('spawn_event');
  });

  it('test_sell_player_emits_flag', () => {
    const r = resolveEvent(payload, 'sell_player', ctx);
    expect(r.sideEffects[0]!.kind).toBe('flag_player_for_sale');
  });
});

describe('resolveEvent — sponsor_offer', () => {
  const payload: SponsorOfferPayload = {
    kind: 'sponsor_offer',
    brand: 'Pueblo Bakery',
    weeklyAmountEurK: 3,
    contractWeeks: 52,
    qualityDelta: 12,
    options: {
      accept: { label: 'Accept', description: '' },
      reject: { label: 'Reject', description: '' },
    },
    defaultOption: 'reject',
  };

  it('test_accept_signs_sponsor_and_bumps_quality', () => {
    const r = resolveEvent(payload, 'accept', ctx);
    expect(r.deltas['sponsor_quality']).toBe(12);
    const sponsor = r.sideEffects.find((s) => s.kind === 'sign_sponsor');
    expect(sponsor).toBeDefined();
    expect((sponsor!.payload as { brand: string }).brand).toBe('Pueblo Bakery');
  });

  it('test_reject_emits_no_effects', () => {
    const r = resolveEvent(payload, 'reject', ctx);
    expect(r.deltas).toEqual({});
    expect(r.sideEffects).toEqual([]);
  });
});

describe('resolveEvent — nomina_frozen_offer', () => {
  const payload: NominaFrozenOfferPayload = {
    kind: 'nomina_frozen_offer',
    options: {
      freeze: { label: '', description: '' },
      refuse: { label: '', description: '' },
    },
    defaultOption: 'refuse',
  };

  it('test_freeze_applies_happiness_penalty_and_counter', () => {
    const r = resolveEvent(payload, 'freeze', ctx);
    expect(r.deltas['player_happiness']).toBe(-15);
    expect(r.sideEffects[0]!.kind).toBe('set_counter');
  });

  it('test_refuse_no_effects', () => {
    expect(resolveEvent(payload, 'refuse', ctx)).toEqual({ deltas: {}, sideEffects: [] });
  });
});

describe('resolveEvent — scandal_response', () => {
  const payload: ScandalResponsePayload = {
    kind: 'scandal_response',
    scandalType: 'corruption',
    severity: 'major',
    options: {
      cooperate: { label: '', description: '' },
      deny: { label: '', description: '' },
    },
    defaultOption: 'cooperate',
  };

  it('test_cooperate_30K_flat_fine', () => {
    expect(resolveEvent(payload, 'cooperate', ctx).deltas['financial_balance']).toBe(-30);
  });
  it('test_deny_increases_exposure', () => {
    expect(resolveEvent(payload, 'deny', ctx).deltas['corruption_exposure']).toBe(15);
  });
});

describe('resolveEvent — corruption_caught', () => {
  const payload: CorruptionCaughtPayload = {
    kind: 'corruption_caught',
    exposureLevel: 82,
    options: {
      accept_consequences: { label: '', description: '' },
      bribe_officials: { label: '', description: '' },
    },
    defaultOption: 'accept_consequences',
  };

  it('test_accept_drops_fan_momentum_and_cancels_sponsors', () => {
    const r = resolveEvent(payload, 'accept_consequences', ctx);
    expect(r.deltas['fan_momentum']).toBe(-25);
    expect(r.sideEffects.find((s) => s.kind === 'cancel_sponsor')).toBeDefined();
  });
  it('test_bribe_costs_money_and_lowers_exposure', () => {
    const r = resolveEvent(payload, 'bribe_officials', ctx);
    expect(r.deltas['financial_balance']).toBe(-80);
    expect(r.deltas['corruption_exposure']).toBe(-20);
  });
});

describe('resolveEvent — transfer_offer', () => {
  const payload: TransferOfferPayload = {
    kind: 'transfer_offer',
    playerId: 'p-1',
    fromClubId: 'club-99',
    offerEurK: 25,
    options: {
      accept: { label: '', description: '' },
      reject: { label: '', description: '' },
      counter: { label: '', description: '' },
    },
    defaultOption: 'reject',
  };

  it('test_accept_credits_balance_and_emits_transfer', () => {
    const r = resolveEvent(payload, 'accept', ctx);
    expect(r.deltas['financial_balance']).toBe(25);
    expect(r.sideEffects[0]!.kind).toBe('transfer_player');
  });
});

describe('resolveEvent — stadium_upgrade_offer', () => {
  const payload: StadiumUpgradeOfferPayload = {
    kind: 'stadium_upgrade_offer',
    proposedCapacityIncrease: 2000,
    costEurK: 150,
    options: {
      accept: { label: '', description: '' },
      defer: { label: '', description: '' },
    },
    defaultOption: 'defer',
  };

  it('test_accept_costs_money_and_adds_capacity', () => {
    const r = resolveEvent(payload, 'accept', ctx);
    expect(r.deltas['financial_balance']).toBe(-150);
    expect(r.deltas['stadium_capacity']).toBe(2000);
  });
});

describe('resolveDefault — timeout fallback', () => {
  it('test_uses_default_option', () => {
    const payload: SponsorOfferPayload = {
      kind: 'sponsor_offer',
      brand: 'X',
      weeklyAmountEurK: 1,
      contractWeeks: 52,
      qualityDelta: 5,
      options: {
        accept: { label: '', description: '' },
        reject: { label: '', description: '' },
      },
      defaultOption: 'reject',
    };
    // Default is 'reject' → no effects
    expect(resolveDefault(payload, ctx)).toEqual({ deltas: {}, sideEffects: [] });
  });
});

describe('resolveEvent — contract_renewal_offer', () => {
  it('test_accept_spawns_followup_event', () => {
    const payload: ContractRenewalOfferPayload = {
      kind: 'contract_renewal_offer',
      playerId: 'p-1',
      playerName: 'Test',
      age: 28,
      currentSalaryEurK: 2,
      proposedSalaryEurK: 3,
      proposedContractWeeks: 104,
      options: {
        accept: { label: '', description: '' },
        decline: { label: '', description: '' },
        counter: { label: '', description: '' },
      },
      defaultOption: 'decline',
    };
    const r = resolveEvent(payload, 'accept', ctx);
    expect(r.sideEffects[0]!.kind).toBe('spawn_event');
  });
});
