/**
 * Match recap — newspaper-style summary of a single match.
 *
 * Pure function. Takes the home/away club names + final score + event list,
 * returns a 2-3 sentence Spanish-language recap suitable for /match/[id].
 *
 * Story: Alma Pass — match recap
 * Control Manifest: 2026-05-20
 */

interface RecapEvent {
  readonly minute: number;
  readonly type: 'goal' | 'yellow_card' | 'red_card' | 'injury';
  readonly team: 'home' | 'away';
}

export interface MatchRecapArgs {
  readonly homeName: string;
  readonly awayName: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly events: readonly RecapEvent[];
}

/** Pluck the team that scored first (or null if 0-0). */
function firstScorer(events: readonly RecapEvent[]): 'home' | 'away' | null {
  const goal = events.find((e) => e.type === 'goal');
  return goal?.team ?? null;
}

/** Highest minute goal — useful for "última hora" framing. */
function lastGoal(events: readonly RecapEvent[]): RecapEvent | null {
  const goals = events.filter((e) => e.type === 'goal');
  if (goals.length === 0) return null;
  return goals.reduce((a, b) => (b.minute > a.minute ? b : a));
}

export function generateMatchRecap(args: Readonly<MatchRecapArgs>): string {
  const { homeName, awayName, homeScore, awayScore, events } = args;
  const sentences: string[] = [];

  // ── Opening sentence (winner/loser/draw) ─────────────────────────────────
  if (homeScore > awayScore) {
    const margin = homeScore - awayScore;
    if (margin >= 3) {
      sentences.push(`Goleada del ${homeName} ante ${awayName}: ${homeScore}-${awayScore}.`);
    } else {
      sentences.push(`Victoria del ${homeName} ante ${awayName} por ${homeScore}-${awayScore}.`);
    }
  } else if (awayScore > homeScore) {
    const margin = awayScore - homeScore;
    if (margin >= 3) {
      sentences.push(`Goleada del ${awayName} en el feudo del ${homeName}: ${homeScore}-${awayScore}.`);
    } else {
      sentences.push(`${awayName} se lleva los tres puntos del campo del ${homeName}: ${homeScore}-${awayScore}.`);
    }
  } else if (homeScore === 0 && awayScore === 0) {
    sentences.push(`Empate sin goles entre ${homeName} y ${awayName}.`);
  } else {
    sentences.push(`Reparto de puntos entre ${homeName} y ${awayName}: ${homeScore}-${awayScore}.`);
  }

  // ── Middle sentence (how it unfolded) ─────────────────────────────────────
  const first = firstScorer(events);
  if (first === 'home') {
    sentences.push(`Los locales abrieron el marcador y marcaron el ritmo en la primera mitad.`);
  } else if (first === 'away') {
    sentences.push(`Los visitantes pegaron primero y forzaron a los locales a remar contracorriente.`);
  } else if (events.length > 0) {
    sentences.push(`Ninguno de los dos equipos logró romper el cero — el partido se rompió con tarjetas y nervios.`);
  }

  // ── Final sentence (cards/injuries/last goal flavour) ────────────────────
  const reds = events.filter((e) => e.type === 'red_card').length;
  const yellows = events.filter((e) => e.type === 'yellow_card').length;
  const injuries = events.filter((e) => e.type === 'injury').length;
  const lg = lastGoal(events);

  if (reds > 0) {
    sentences.push(`El partido se calentó con ${reds === 1 ? 'una expulsión' : `${reds} expulsiones`} y ${yellows} amarilla${yellows === 1 ? '' : 's'}.`);
  } else if (lg && lg.minute >= 80) {
    sentences.push(`El último gol llegó en el minuto ${lg.minute}, cerrando un partido tenso hasta el pitido final.`);
  } else if (injuries > 0) {
    sentences.push(`La nota negativa fueron ${injuries === 1 ? 'una lesión' : `${injuries} lesiones`} que obligará al cuerpo médico a trabajar esta semana.`);
  } else if (yellows >= 4) {
    sentences.push(`El árbitro tuvo trabajo con ${yellows} amarillas repartidas entre ambos equipos.`);
  } else {
    sentences.push(`Partido sin incidencias mayores — los protagonistas fueron los futbolistas.`);
  }

  return sentences.join(' ');
}
