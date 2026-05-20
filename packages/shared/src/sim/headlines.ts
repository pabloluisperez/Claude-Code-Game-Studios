/**
 * Newspaper headline generator.
 *
 * Pure function: given a snapshot of the player's situation, returns a curated
 * list of headline strings ready to render as a fake newspaper / TV-ticker.
 *
 * Used in two contexts:
 *  - During the AdvanceTransition modal: brief flavour copy (mostly generic).
 *  - In the Newspaper card on the dashboard after advance: data-grounded
 *    headlines (the match result, sponsor decisions, etc.).
 *
 * Templates with `{slot}` placeholders are filled deterministically from the
 * provided context — same input → same output.
 *
 * Story: Alma Pass — headlines
 * Control Manifest: 2026-05-20
 */

export interface HeadlineContext {
  readonly clubName: string;
  readonly week: number;
  readonly weekDateDisplay: string;
  /** Latest match result, if there was one this week. */
  readonly lastResult?: {
    readonly opponentName: string;
    readonly isHome: boolean;
    readonly myScore: number;
    readonly oppScore: number;
    readonly outcome: 'win' | 'draw' | 'loss';
  };
  /** Position in the standings (1-based) and total clubs. */
  readonly position?: number;
  readonly totalClubs?: number;
  /** Significant deltas the player should know about. */
  readonly newSponsor?: string;
  readonly cancelledSponsor?: string;
  readonly newInjuries?: number;
  /** Current cashflow trend — used for "directiva nerviosa" headlines. */
  readonly weeklyCashflow?: number;
  readonly financialBalance?: number;
}

export interface Headline {
  readonly tag: 'match' | 'finance' | 'sponsor' | 'medical' | 'mood' | 'ambient';
  readonly text: string;
}

/** Deterministic hash → bounded index. */
function pickIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % mod;
}

function pickFrom<T>(arr: readonly T[], seed: string): T {
  return arr[pickIndex(seed, arr.length)]!;
}

// ── Templates ───────────────────────────────────────────────────────────────

const WIN_TEMPLATES = [
  '{club} se lleva los tres puntos: {my}-{opp} ante {opp_name}',
  'Victoria sufrida pero merecida del {club}: {my}-{opp}',
  '{club} suma y sigue. {my}-{opp} contra {opp_name}',
  'La afición se va contenta a casa: {club} {my}-{opp} {opp_name}',
  'Triunfo del {club} en {venue}. {my}-{opp}',
];
const DRAW_TEMPLATES = [
  '{club} empata sin brillo: {my}-{opp} contra {opp_name}',
  'Reparto de puntos en {venue}: {club} {my}-{opp} {opp_name}',
  '{club} se queda a medias. Empate a {my}',
  'Sabor agridulce para el {club}. {my}-{opp} con {opp_name}',
];
const LOSS_TEMPLATES = [
  'Derrota dolorosa del {club} ante {opp_name}: {my}-{opp}',
  '{club} cae en {venue}: {my}-{opp} contra {opp_name}',
  '{club} se vuelve con las manos vacías. {my}-{opp}',
  'Mal partido del {club}. {opp_name} se lleva los puntos: {my}-{opp}',
];

const NO_MATCH_TEMPLATES = [
  'Semana sin partido. Entrenamientos a doble sesión en {club}.',
  '{club} aprovecha el parón para preparar la próxima jornada.',
  'Pretemporada: los jugadores del {club} se ponen a tono.',
  'Trabajo de oficina esta semana en {club}.',
];

const POSITION_TOP_TEMPLATES = [
  '{club} sigue líder de la tabla. La afición sueña en grande.',
  'Posición de privilegio: {club} está {pos}º después de la última jornada.',
  '{club} ({pos}º) demuestra que va en serio esta temporada.',
];
const POSITION_MID_TEMPLATES = [
  '{club} se asienta en la zona media ({pos}º de {total}).',
  'Mitad de la tabla para el {club}. Trabajo discreto pero solvente.',
];
const POSITION_BOTTOM_TEMPLATES = [
  'Llamadas de alerta: el {club} cae al puesto {pos}º.',
  'Zona peligrosa para el {club}, que es {pos}º de {total}.',
  'La directiva pide explicaciones. {club} {pos}º en la tabla.',
];

const SPONSOR_NEW = [
  '{club} firma nuevo patrocinador: {sponsor}.',
  'Nuevo patrocinio para el {club}: {sponsor} aparece en la camiseta.',
  'Acuerdo cerrado: {sponsor} se une al proyecto del {club}.',
];
const SPONSOR_CANCELLED = [
  '{sponsor} retira su patrocinio del {club}. Vacío en el balance.',
  'Mala noticia financiera: {sponsor} rescinde con el {club}.',
];

const INJURY = [
  'Parte médico: {n} nuevas lesiones en el {club}. Semana de rehabilitación.',
  'La enfermería del {club} se llena: {n} jugadores en el dique seco.',
];

const CASHFLOW_RED = [
  'Las cuentas del {club} pintan rojo. La directiva está nerviosa.',
  'Goteo de pérdidas: el {club} pierde dinero cada semana que pasa.',
  'Aviso del director financiero: si esto sigue, hay problemas.',
];
const CASHFLOW_GREEN = [
  'El {club} cierra la semana con beneficios. Tranquilidad en el despacho.',
  'Balance positivo para el {club}. La directiva sonríe.',
];

const AMBIENT = [
  'La ciudad se prepara para una nueva jornada.',
  'En las redes sociales, los aficionados del {club} debaten alineaciones.',
  'El estadio del {club} ya luce las luces encendidas.',
  'Comienza una nueva semana en el fútbol modesto.',
  'Tertulias deportivas: ¿qué hará el {club} esta semana?',
  'Los chavales de la cantera del {club} entrenan a tope.',
];

// ── Fill helper ──────────────────────────────────────────────────────────────

function fill(
  template: string,
  ctx: Readonly<Record<string, unknown>>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = ctx[key];
    if (v === undefined || v === null) return `{${key}}`;
    if (typeof v === 'object') return `{${key}}`;
    return String(v);
  });
}

/** Build a deterministic list of headlines. */
export function generateHeadlines(
  ctx: Readonly<HeadlineContext>,
): readonly Headline[] {
  const out: Headline[] = [];
  const seedBase = `${ctx.clubName}:${ctx.week}`;

  // 1. Match result (most prominent)
  if (ctx.lastResult) {
    const r = ctx.lastResult;
    const venue = r.isHome ? 'casa' : 'el feudo rival';
    const slots = {
      ...ctx,
      club: ctx.clubName,
      opp_name: r.opponentName,
      my: r.myScore,
      opp: r.oppScore,
      venue,
    };
    if (r.outcome === 'win') {
      out.push({ tag: 'match', text: fill(pickFrom(WIN_TEMPLATES, seedBase + ':match'), slots) });
    } else if (r.outcome === 'draw') {
      out.push({ tag: 'match', text: fill(pickFrom(DRAW_TEMPLATES, seedBase + ':match'), slots) });
    } else {
      out.push({ tag: 'match', text: fill(pickFrom(LOSS_TEMPLATES, seedBase + ':match'), slots) });
    }
  } else {
    out.push({
      tag: 'ambient',
      text: fill(pickFrom(NO_MATCH_TEMPLATES, seedBase + ':noMatch'), { ...ctx, club: ctx.clubName }),
    });
  }

  // 2. Position (only if we know it)
  if (ctx.position !== undefined && ctx.totalClubs !== undefined && ctx.totalClubs > 0) {
    const slots = { ...ctx, club: ctx.clubName, pos: ctx.position, total: ctx.totalClubs };
    const bucket = ctx.position <= 3
      ? POSITION_TOP_TEMPLATES
      : ctx.position >= ctx.totalClubs - 2
        ? POSITION_BOTTOM_TEMPLATES
        : POSITION_MID_TEMPLATES;
    out.push({ tag: 'mood', text: fill(pickFrom(bucket, seedBase + ':pos'), slots) });
  }

  // 3. Sponsor activity
  if (ctx.newSponsor) {
    out.push({
      tag: 'sponsor',
      text: fill(pickFrom(SPONSOR_NEW, seedBase + ':spNew'), {
        ...ctx,
        club: ctx.clubName,
        sponsor: ctx.newSponsor,
      }),
    });
  }
  if (ctx.cancelledSponsor) {
    out.push({
      tag: 'sponsor',
      text: fill(pickFrom(SPONSOR_CANCELLED, seedBase + ':spCx'), {
        ...ctx,
        club: ctx.clubName,
        sponsor: ctx.cancelledSponsor,
      }),
    });
  }

  // 4. Injuries
  if (ctx.newInjuries !== undefined && ctx.newInjuries > 0) {
    out.push({
      tag: 'medical',
      text: fill(pickFrom(INJURY, seedBase + ':inj'), {
        ...ctx,
        club: ctx.clubName,
        n: ctx.newInjuries,
      }),
    });
  }

  // 5. Cashflow drift
  if (ctx.weeklyCashflow !== undefined) {
    if (ctx.weeklyCashflow < -20) {
      out.push({
        tag: 'finance',
        text: fill(pickFrom(CASHFLOW_RED, seedBase + ':cash'), { ...ctx, club: ctx.clubName }),
      });
    } else if (ctx.weeklyCashflow > 10) {
      out.push({
        tag: 'finance',
        text: fill(pickFrom(CASHFLOW_GREEN, seedBase + ':cash'), { ...ctx, club: ctx.clubName }),
      });
    }
  }

  // 6. Ambient filler — always include 1 to keep the ticker varied.
  out.push({
    tag: 'ambient',
    text: fill(pickFrom(AMBIENT, seedBase + ':amb'), { ...ctx, club: ctx.clubName }),
  });

  return out;
}
