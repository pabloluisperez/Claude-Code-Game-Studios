/**
 * /city — Museo del club + barrio (v1.1 Sprint 23).
 *
 * ADR-030 reconversion: this route used to render the legacy city-progression
 * isometric view (now superseded by stadium-upgrades.md). It now hosts the
 * museum + barrio: 5 categories of historical objects + navigation cards to
 * stadium / manager office.
 *
 * v1.1 ships a DOM-first museum (no PixiJS canvas). Story 23-4/5 originally
 * planned PixiJS BarrioScene + MuseumInteriorScene; deferred to v1.2+ as a
 * polish layer. DOM render is fully accessible by default (no /city-text
 * fallback needed when the primary view is already DOM).
 *
 * Loads `/api/museum/contents` for the user's active playthrough club.
 */

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, clubs, loadAdvanceContext, eq } from '@smt/db';

type MuseumPayload = {
  trophies: Array<{ id: string; kind: string; seasonNumber: number; name: string }>;
  banners: Array<{ id: string; kind: string; week: number; description: string; homeScore: number; awayScore: number }>;
  legendTransfers: Array<{ id: string; playerName: string; direction: string; valueEurK: number }>;
  financialMilestones: Array<{ id: string; kind: string; week: number; description: string }>;
  stadiumHistory: Array<{ id: string; itemSlug: string; track: string; tier: number; completedAt: string }>;
  totalObjects: number;
  museumDensity: number;
};

export const load: PageServerLoad = async ({ locals, fetch }) => {
  if (!locals.user) throw redirect(303, '/login');

  const ctx = await loadAdvanceContext(db, locals.user.id);
  if (!ctx) {
    return { hasPlaythrough: false, club: null, museum: null };
  }

  const [club] = await db
    .select({
      id: clubs.id,
      name: clubs.name,
      city: clubs.city,
      cityTier: clubs.cityTier,
      currentSeason: clubs.currentSeason,
    })
    .from(clubs)
    .where(eq(clubs.id, ctx.playthrough.clubId));

  let museum: MuseumPayload | null = null;
  if (club) {
    try {
      const res = await fetch(`/api/museum/contents?clubId=${encodeURIComponent(club.id)}`);
      if (res.ok) {
        museum = (await res.json()) as MuseumPayload;
      }
    } catch {
      // Tolerate transient API errors — the museum view renders the empty state.
    }
  }

  return {
    hasPlaythrough: true,
    club: club ?? null,
    museum,
  };
};
