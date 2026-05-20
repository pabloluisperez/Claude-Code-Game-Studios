/**
 * Newspaper headline generator (expanded).
 *
 * Pure function: given a snapshot of the player's situation, returns a
 * curated list of headline strings ready to render as a fake newspaper /
 * TV-ticker.
 *
 * Templates fill `{slot}` placeholders deterministically from context —
 * same input → same output. Multiple templates per category give variety
 * across reads.
 *
 * Story: Alma Pass — headlines expansion
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
  /** Training intensity (0..100). 50 = normal. */
  readonly trainingIntensity?: number;
  /** Manager name to namedrop occasionally. */
  readonly managerName?: string;
  /** Optional standout player name. */
  readonly topPlayerName?: string;
  /** Fan momentum 0..100 — used by some templates. */
  readonly fanMomentum?: number;
}

export interface Headline {
  readonly tag:
    | 'match'
    | 'finance'
    | 'sponsor'
    | 'medical'
    | 'mood'
    | 'training'
    | 'board'
    | 'youth'
    | 'fans'
    | 'ambient';
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
  '{club} firma una victoria contundente: {my}-{opp} a {opp_name}',
  '{manager} se viste de fiesta tras el {my}-{opp} ante {opp_name}',
  'El vestuario del {club} celebra otro triunfo. {my}-{opp}',
  '{club} demuestra carácter en {venue} y gana {my}-{opp}',
  'Tres puntos clave para el {club}: {my}-{opp} a {opp_name}',
];
const DRAW_TEMPLATES = [
  '{club} empata sin brillo: {my}-{opp} contra {opp_name}',
  'Reparto de puntos en {venue}: {club} {my}-{opp} {opp_name}',
  '{club} se queda a medias. Empate a {my}',
  'Sabor agridulce para el {club}. {my}-{opp} con {opp_name}',
  '{opp_name} y {club} firman tablas: {my}-{opp}',
  'Empate justo en {venue}. {my}-{opp}',
  '{club} suma un punto, pero deja escapar dos. {my}-{opp}',
  'Sin ganador entre {club} y {opp_name}: {my}-{opp}',
];
const LOSS_TEMPLATES = [
  'Derrota dolorosa del {club} ante {opp_name}: {my}-{opp}',
  '{club} cae en {venue}: {my}-{opp} contra {opp_name}',
  '{club} se vuelve con las manos vacías. {my}-{opp}',
  'Mal partido del {club}. {opp_name} se lleva los puntos: {my}-{opp}',
  'Tropezón del {club} ante {opp_name}: {my}-{opp}',
  '{opp_name} doblega al {club}: {my}-{opp}',
  '{manager} pide disculpas a la afición tras el {my}-{opp}',
  '{club} no encuentra la portería: {my}-{opp} ante {opp_name}',
  'Jornada para olvidar para el {club}. {opp_name} gana {my}-{opp}',
];

const NO_MATCH_TEMPLATES = [
  'Semana sin partido. Entrenamientos a doble sesión en {club}.',
  '{club} aprovecha el parón para preparar la próxima jornada.',
  'Pretemporada: los jugadores del {club} se ponen a tono.',
  'Trabajo de oficina esta semana en {club}.',
  '{manager} reúne al staff para revisar el plan de la semana.',
  'El {club} entrena con normalidad — sin partido oficial.',
  'Día de prensa en {club}: {manager} contesta preguntas de la prensa local.',
  'El terreno de juego del {club} se prepara para la próxima jornada.',
];

const POSITION_TOP_TEMPLATES = [
  '{club} sigue líder de la tabla. La afición sueña en grande.',
  'Posición de privilegio: {club} está {pos}º después de la última jornada.',
  '{club} ({pos}º) demuestra que va en serio esta temporada.',
  'Los rivales miran de reojo al {club}, instalado en el {pos}º puesto.',
  '{club} en lo alto: {pos}º con paso firme.',
];
const POSITION_MID_TEMPLATES = [
  '{club} se asienta en la zona media ({pos}º de {total}).',
  'Mitad de la tabla para el {club}. Trabajo discreto pero solvente.',
  '{club} ({pos}º) sin sobresaltos en una zona cómoda.',
  'El {club} ronda el centro de la tabla — pos {pos} de {total}.',
];
const POSITION_BOTTOM_TEMPLATES = [
  'Llamadas de alerta: el {club} cae al puesto {pos}º.',
  'Zona peligrosa para el {club}, que es {pos}º de {total}.',
  'La directiva pide explicaciones. {club} {pos}º en la tabla.',
  'El {club} (puesto {pos}) entra en alerta roja por descenso.',
  '{manager} en el ojo del huracán — {club} hundido en el {pos}º.',
];

const SPONSOR_NEW = [
  '{club} firma nuevo patrocinador: {sponsor}.',
  'Nuevo patrocinio para el {club}: {sponsor} aparece en la camiseta.',
  'Acuerdo cerrado: {sponsor} se une al proyecto del {club}.',
  '{sponsor} apuesta por el {club}. Ingresos al alza.',
  'El {club} renueva la pechera: {sponsor} llega como nuevo socio comercial.',
];
const SPONSOR_CANCELLED = [
  '{sponsor} retira su patrocinio del {club}. Vacío en el balance.',
  'Mala noticia financiera: {sponsor} rescinde con el {club}.',
  '{sponsor} se desvincula del {club} tras la última polémica.',
  'El acuerdo con {sponsor} no se renueva. Adiós a una fuente de ingresos.',
];

const INJURY = [
  'Parte médico: {n} nuevas lesiones en el {club}. Semana de rehabilitación.',
  'La enfermería del {club} se llena: {n} jugadores en el dique seco.',
  'Mal momento físico: {n} bajas confirmadas en el {club}.',
  '{n} jugadores del {club} pasarán por el fisio esta semana.',
  'El cuerpo técnico del {club} ya tiene {n} bajas para el próximo partido.',
];

const CASHFLOW_RED = [
  'Las cuentas del {club} pintan rojo. La directiva está nerviosa.',
  'Goteo de pérdidas: el {club} pierde dinero cada semana que pasa.',
  'Aviso del director financiero: si esto sigue, hay problemas.',
  'El {club} apura su tesorería — cada semana se acerca más al rojo.',
  'Cuentas en alerta: el {club} no para de perder dinero.',
];
const CASHFLOW_GREEN = [
  'El {club} cierra la semana con beneficios. Tranquilidad en el despacho.',
  'Balance positivo para el {club}. La directiva sonríe.',
  'Buen momento financiero: el {club} genera caja.',
  'Las cuentas del {club} se enderezan — semana en positivo.',
];

// New training-related headlines based on intensity bucket.
const TRAINING_REST = [
  '{manager} baja el ritmo: semana de descanso en el {club}.',
  'El {club} entrena suave esta semana. La plantilla agradece la calma.',
  'Sesiones ligeras en {club} para recuperar piernas.',
];
const TRAINING_NORMAL = [
  'Semana normal de entrenamientos en el {club}.',
  '{manager} mantiene la intensidad habitual con sus pupilos.',
  'El {club} trabaja con normalidad de cara al próximo partido.',
];
const TRAINING_HARD = [
  '{manager} mete caña: doble sesión en el {club} esta semana.',
  'Trabajo intenso en {club}: el cuerpo técnico aprieta a la plantilla.',
  'El {club} se prepara con sesiones exigentes — la afición lo espera.',
];
const TRAINING_BRUTAL = [
  '{manager} lleva al límite a la plantilla del {club}. Riesgo de lesiones al alza.',
  'Entrenamientos brutales en {club}: ¿pasará factura?',
  '{club} bajo presión física máxima. Los más físicos lo agradecen.',
];

// Board pressure based on position.
const BOARD_HAPPY = [
  'La directiva del {club} respalda públicamente a {manager}.',
  'El presidente del {club} se muestra satisfecho con la marcha del equipo.',
  '{manager} cuenta con todo el apoyo del consejo del {club}.',
];
const BOARD_WORRIED = [
  'Rumores en los pasillos del {club}: el consejo no está contento.',
  'La continuidad de {manager} se discute en los corrillos del {club}.',
  'Reunión de urgencia del consejo del {club} esta semana.',
];

// Youth / academy — appears occasionally as filler.
const YOUTH = [
  '{topPlayer} (cantera) sigue ganándose minutos en el {club}.',
  'La cantera del {club} apunta maneras — varios juveniles destacan en los entrenos.',
  '{topPlayer} se gana elogios en el vestuario por su trabajo.',
  'Los chavales del filial del {club} entrenan con la primera plantilla esta semana.',
];

// Fan-facing.
const FANS_HAPPY = [
  'La grada del {club} canta sin parar: la afición está enchufada.',
  'Récord de banderas en las gradas del {club}.',
  'Los aficionados del {club} preparan un mosaico para el próximo partido.',
];
const FANS_ANGRY = [
  'Pancartas de protesta en el estadio del {club}.',
  'La grada del {club} se planta — pide cambios al consejo.',
  'Silencio en el estadio del {club}: la afición no perdona los últimos resultados.',
];

const AMBIENT = [
  'La ciudad se prepara para una nueva jornada.',
  'En las redes sociales, los aficionados del {club} debaten alineaciones.',
  'El estadio del {club} ya luce las luces encendidas.',
  'Comienza una nueva semana en el fútbol modesto.',
  'Tertulias deportivas: ¿qué hará el {club} esta semana?',
  'Los chavales de la cantera del {club} entrenan a tope.',
  'Reunión de capitanes en el {club}: temas internos del vestuario.',
  '{manager} concede una entrevista a la radio local.',
  'El bar de siempre se llena de aficionados del {club} comentando la actualidad.',
  'Los focos del estadio del {club} se encienden temprano.',
  'El autobús del {club} sale del entrenamiento puntual.',
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
  const slotsBase: Record<string, string | number> = {
    club: ctx.clubName,
    manager: ctx.managerName ?? 'el míster',
    topPlayer: ctx.topPlayerName ?? 'el capitán',
  };

  // 1. Match result (most prominent)
  if (ctx.lastResult) {
    const r = ctx.lastResult;
    const venue = r.isHome ? 'casa' : 'el feudo rival';
    const slots = {
      ...slotsBase,
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
      text: fill(pickFrom(NO_MATCH_TEMPLATES, seedBase + ':noMatch'), slotsBase),
    });
  }

  // 2. Position (only if we know it)
  if (ctx.position !== undefined && ctx.totalClubs !== undefined && ctx.totalClubs > 0) {
    const slots = { ...slotsBase, pos: ctx.position, total: ctx.totalClubs };
    const bucket = ctx.position <= 3
      ? POSITION_TOP_TEMPLATES
      : ctx.position >= ctx.totalClubs - 2
        ? POSITION_BOTTOM_TEMPLATES
        : POSITION_MID_TEMPLATES;
    out.push({ tag: 'mood', text: fill(pickFrom(bucket, seedBase + ':pos'), slots) });

    // Board pressure follows position.
    const boardBucket = ctx.position <= ctx.totalClubs / 2 ? BOARD_HAPPY : BOARD_WORRIED;
    out.push({ tag: 'board', text: fill(pickFrom(boardBucket, seedBase + ':board'), slots) });
  }

  // 3. Sponsor activity
  if (ctx.newSponsor) {
    out.push({
      tag: 'sponsor',
      text: fill(pickFrom(SPONSOR_NEW, seedBase + ':spNew'), {
        ...slotsBase,
        sponsor: ctx.newSponsor,
      }),
    });
  }
  if (ctx.cancelledSponsor) {
    out.push({
      tag: 'sponsor',
      text: fill(pickFrom(SPONSOR_CANCELLED, seedBase + ':spCx'), {
        ...slotsBase,
        sponsor: ctx.cancelledSponsor,
      }),
    });
  }

  // 4. Injuries
  if (ctx.newInjuries !== undefined && ctx.newInjuries > 0) {
    out.push({
      tag: 'medical',
      text: fill(pickFrom(INJURY, seedBase + ':inj'), {
        ...slotsBase,
        n: ctx.newInjuries,
      }),
    });
  }

  // 5. Cashflow drift
  if (ctx.weeklyCashflow !== undefined) {
    if (ctx.weeklyCashflow < -20) {
      out.push({
        tag: 'finance',
        text: fill(pickFrom(CASHFLOW_RED, seedBase + ':cash'), slotsBase),
      });
    } else if (ctx.weeklyCashflow > 10) {
      out.push({
        tag: 'finance',
        text: fill(pickFrom(CASHFLOW_GREEN, seedBase + ':cash'), slotsBase),
      });
    }
  }

  // 6. Training intensity flavour
  if (ctx.trainingIntensity !== undefined) {
    const t = ctx.trainingIntensity;
    const bucket =
      t <= 20 ? TRAINING_REST :
      t >= 85 ? TRAINING_BRUTAL :
      t >= 65 ? TRAINING_HARD :
      TRAINING_NORMAL;
    out.push({ tag: 'training', text: fill(pickFrom(bucket, seedBase + ':train'), slotsBase) });
  }

  // 7. Fan-driven flavour from momentum + position combination.
  if (ctx.fanMomentum !== undefined) {
    if (ctx.fanMomentum >= 75) {
      out.push({ tag: 'fans', text: fill(pickFrom(FANS_HAPPY, seedBase + ':fans'), slotsBase) });
    } else if (ctx.fanMomentum <= 30) {
      out.push({ tag: 'fans', text: fill(pickFrom(FANS_ANGRY, seedBase + ':fans'), slotsBase) });
    }
  }

  // 8. Youth pulse (occasional — every 3 weeks).
  if (ctx.week % 3 === 0) {
    out.push({ tag: 'youth', text: fill(pickFrom(YOUTH, seedBase + ':youth'), slotsBase) });
  }

  // 9. Ambient filler — always include 1 to keep the ticker varied.
  out.push({
    tag: 'ambient',
    text: fill(pickFrom(AMBIENT, seedBase + ':amb'), slotsBase),
  });

  return out;
}
