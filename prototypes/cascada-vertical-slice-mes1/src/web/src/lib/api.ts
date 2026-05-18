// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

/**
 * Thin client for the slice Hono API. The /api/* path is proxied by Vite to
 * the Hono server on :3010.
 */

export const SLICE_PLAYTHROUGH_ID = "playthrough-slice-001";

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`${res.status}: ${errBody}`);
  }
  return res.json() as Promise<T>;
}

// ── Types — duplicate of slice sim types to avoid a circular dep in the web bundle ─

export interface WorldStateLite {
  team_fitness: number;
  staff_morale: number;
  fan_momentum: number;
  fan_attendance: number;
  match_performance_index: number;
  injury_risk: number;
  training_intensity: number;
  ticket_price_index: number;
  field_quality: number;
  player_happiness: number;
}

export interface PlaythroughDto {
  id: string;
  managerClubId: string;
  currentWeek: number;
  seed: string;
}

export interface StateDto {
  playthrough: PlaythroughDto;
  snapshot: {
    week: number;
    state: WorldStateLite;
    delayedBuffer: unknown[];
    managerState: unknown;
  } | null;
}

export interface StandingsRow {
  clubId: string;
  clubName: string;
  clubShortName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  goalDifference: number;
  position: number;
}

export interface StaffMessageDto {
  id: number;
  week: number;
  staffRole: string;
  staffTier: number;
  templateKey: string;
  body: string;
  priority: "ROUTINE" | "ADVISORY" | "BLOCKING";
  causalNodeId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface FixtureDto {
  id: string;
  week: number;
  homeClubId: string;
  awayClubId: string;
  status: "scheduled" | "played";
  homeScore: number | null;
  awayScore: number | null;
}

export interface AdvanceResponse {
  weekProcessed: number;
  playerMatchOutcome: {
    homeScore: number;
    awayScore: number;
    winner: "home" | "away" | "draw";
    worldStateDeltas: { match_performance_index: number; injury_risk: number };
  } | null;
  finalState: WorldStateLite;
  thresholdCrossings: { nodeId: string; reason: string; value: number }[];
  events: { id: string; priority: string; title: string; body: string; week: number }[];
  managerState: {
    level: number;
    xp: number;
    xpToNextLevel: number;
    skills: { tactics: number; finance: number };
    pendingSkillPoints: number;
    careerEvents: { id: string; title: string; body: string; week: number; acknowledged: boolean }[];
  };
  managerXpGains: { source: string; amount: number }[];
  managerLeveledUp: boolean;
}

// ── API calls ─────────────────────────────────────────────────────────────

export function getState(playthroughId = SLICE_PLAYTHROUGH_ID): Promise<StateDto> {
  return http("GET", `/api/advance/state/${playthroughId}`);
}

export function getStandings(playthroughId = SLICE_PLAYTHROUGH_ID): Promise<StandingsRow[]> {
  return http("GET", `/api/advance/standings/${playthroughId}`);
}

export function getStaffMessages(
  playthroughId = SLICE_PLAYTHROUGH_ID,
  limit = 50,
): Promise<StaffMessageDto[]> {
  return http("GET", `/api/advance/staff-messages/${playthroughId}?limit=${limit}`);
}

export function getFixturesForWeek(
  week: number,
  playthroughId = SLICE_PLAYTHROUGH_ID,
): Promise<FixtureDto[]> {
  return http("GET", `/api/advance/fixtures/${playthroughId}/week/${week}`);
}

export function postAdvance(
  decisions: { training_intensity: number; ticket_price_index: number },
  playthroughId = SLICE_PLAYTHROUGH_ID,
): Promise<AdvanceResponse> {
  return http("POST", "/api/advance", { playthroughId, decisions });
}

export interface MatchEventDto {
  type: string;
  minute: number;
  team?: "home" | "away";
  playerId?: string;
  severity?: string;
}

export interface LineupPlayerLite {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
}

export function startMatch(
  playthroughId = SLICE_PLAYTHROUGH_ID,
): Promise<{
  sessionId: string;
  pausedAtTick: number;
  scoreSoFar: { home: number; away: number };
  eventsSoFar: number;
  firstHalfEvents: MatchEventDto[];
  homeClubName: string;
  awayClubName: string;
  playerClubSide: "home" | "away";
  homeLineup: LineupPlayerLite[];
  awayLineup: LineupPlayerLite[];
}> {
  return http("POST", "/api/matches/start", { playthroughId });
}

export function allocateSkill(
  skill: "tactics" | "finance",
  playthroughId = SLICE_PLAYTHROUGH_ID,
): Promise<{ managerState: unknown }> {
  return http("POST", "/api/advance/allocate-skill", { playthroughId, skill });
}

export function decideMatch(args: {
  sessionId: string;
  decision: null | {
    side: "home" | "away";
    playerOutId: string;
    playerInStats: Record<string, unknown>;
  };
  playerDecisionsForCascade: { training_intensity: number; ticket_price_index: number };
}): Promise<unknown> {
  return http("POST", "/api/matches/decision", args);
}
