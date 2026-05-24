/**
 * Smoke tests for the tv-rights module — verifies the route factory and
 * service module load without runtime errors and surface the expected exports.
 *
 * Full DB-backed integration tests (covering AC-TV-15/16/17/18/18b/21/43/54)
 * require a live Postgres instance and will be added in a follow-up using
 * the project's `docker-compose up postgres` workflow.
 *
 * Story: TVR-004 (smoke level)
 * Control Manifest: 2026-05-19
 */

import { describe, it, expect } from 'vitest';
import { createTVRightsRoutes } from '../../src/modules/tv-rights/routes.js';
import * as TVRightsService from '../../src/modules/tv-rights/service.js';
import * as TVRightsRepo from '../../src/modules/tv-rights/repo.js';

describe('tv-rights routes — factory smoke', () => {
  it('test_factory_returns_hono_app', () => {
    const app = createTVRightsRoutes();
    expect(app).toBeDefined();
    expect(typeof app.fetch).toBe('function');
  });
});

describe('tv-rights service — module exports', () => {
  it('test_service_exports_signContract', () => {
    expect(typeof TVRightsService.signContract).toBe('function');
  });

  it('test_service_exports_rejectOffer', () => {
    expect(typeof TVRightsService.rejectOffer).toBe('function');
  });

  it('test_service_exports_runTVTick', () => {
    expect(typeof TVRightsService.runTVTick).toBe('function');
  });

  it('test_service_exports_processSeasonEnd', () => {
    expect(typeof TVRightsService.processSeasonEnd).toBe('function');
  });

  it('test_service_exports_processSeasonStart', () => {
    expect(typeof TVRightsService.processSeasonStart).toBe('function');
  });

  it('test_service_exports_readTVWeeklyRevenue', () => {
    expect(typeof TVRightsService.readTVWeeklyRevenue).toBe('function');
  });

  it('test_service_exports_error_classes', () => {
    expect(TVRightsService.TVContractConflictError).toBeDefined();
    expect(TVRightsService.TVOfferExpiredError).toBeDefined();
    // Conflict error carries structured fields
    const err = new TVRightsService.TVContractConflictError({
      currentTier: 'REGIONAL',
      seasonInContract: 1,
      season: 2,
    });
    expect(err.name).toBe('TVContractConflictError');
    expect(err.currentTier).toBe('REGIONAL');
    expect(err.season).toBe(2);
  });
});

describe('tv-rights repo — module exports', () => {
  it('test_repo_exports_findActiveContract', () => {
    expect(typeof TVRightsRepo.findActiveContract).toBe('function');
  });

  it('test_repo_exports_createContract', () => {
    expect(typeof TVRightsRepo.createContract).toBe('function');
  });

  it('test_repo_exports_updateContractStatus', () => {
    expect(typeof TVRightsRepo.updateContractStatus).toBe('function');
  });

  it('test_repo_exports_incrementSeasonInContract', () => {
    expect(typeof TVRightsRepo.incrementSeasonInContract).toBe('function');
  });

  it('test_repo_exports_findContractForSeason', () => {
    expect(typeof TVRightsRepo.findContractForSeason).toBe('function');
  });
});
