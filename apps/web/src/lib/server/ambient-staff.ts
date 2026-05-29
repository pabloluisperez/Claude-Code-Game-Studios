/**
 * Weekly "check-in" staff messages.
 *
 * The threshold-based `generateStaffMessages` from @smt/shared only emits
 * when nodes move by >5% × QUALITY_FACTOR per week. Early in a career
 * (and during quiet weeks) that's nothing — the dashboard inbox looks
 * dead.
 *
 * This helper emits ONE ROUTINE check-in per active staff member each
 * week, based on the current bucket of their primary domain node.
 * Always something to read.
 *
 * Story: Ambient staff messages
 * Control Manifest: 2026-05-20
 */

import { renderNarrative, type WorldState } from '@smt/shared';

type StaffRole =
  | 'groundskeeper'
  | 'fitness_coach'
  | 'commercial_director'
  | 'scouting_director'
  | 'finance_director'
  | 'head_coach';

interface ActiveStaff {
  id: string;
  name: string;
  role: string;
  qualityTier: number;
}

interface AmbientMessage {
  staffId: string;
  templateKey: string;
  content: string;
  priority: 'ROUTINE';
}

/** How often a "good news" (high bucket) ambient note is allowed to surface. */
const GOOD_NEWS_EVERY_N_WEEKS = 4;

/** Stable small salt per role so good-news weeks are staggered, not all at once. */
function roleSalt(role: string): number {
  let h = 0;
  for (let i = 0; i < role.length; i++) h = (h + role.charCodeAt(i)) % GOOD_NEWS_EVERY_N_WEEKS;
  return h;
}

const ROLE_LABEL: Readonly<Record<string, string>> = {
  groundskeeper: 'jardinero',
  fitness_coach: 'preparador físico',
  commercial_director: 'director comercial',
  scouting_director: 'director de scouting',
  finance_director: 'director financiero',
  head_coach: 'segundo entrenador',
};

/**
 * Per-role templates by bucket (low / mid / high) of the primary domain node.
 * Each tuple = [lowVariants, midVariants, highVariants]. The narrative engine
 * (Sprint 26-9) picks one variant per role/week seeded — so the same situation
 * reads differently across weeks instead of a single stamped line. The MID
 * bucket is suppressed (see filter below) so its variants rarely surface.
 */
const TEMPLATES_BY_ROLE: Readonly<Record<StaffRole, readonly [readonly string[], readonly string[], readonly string[]]>> = {
  groundskeeper: [
    [
      'El césped está sufriendo. Le doy un repaso esta semana.',
      'El terreno se resiente; toca trabajo extra de mantenimiento.',
      'El campo no está fino. Esta semana lo cuido a fondo.',
    ],
    ['El terreno aguanta. Trabajo de mantenimiento habitual.'],
    [
      'El campo está perfecto. Los chicos lo notan al pase.',
      'El césped luce inmejorable esta semana.',
      'Terreno de juego impecable; da gusto verlo.',
    ],
  ],
  fitness_coach: [
    [
      'El equipo llega cansado a los entrenamientos. Toca aflojar.',
      'Acumulamos fatiga; bajo la carga esta semana.',
      'La plantilla está justa de piernas. Conviene rotar.',
    ],
    ['Condición física aceptable. Mantenemos el plan.'],
    [
      'Plantilla muy enchufada físicamente. Buen momento para apretar.',
      'El grupo está fino de forma; podemos exigir más.',
      'Excelente condición física esta semana.',
    ],
  ],
  commercial_director: [
    [
      'La conversión de patrocinios es floja esta semana.',
      'Cuesta cerrar acuerdos comerciales ahora mismo.',
      'El interés de las marcas está flojo estos días.',
    ],
    ['Movimiento comercial normal — algunos contactos en marcha.'],
    [
      'Buen ambiente comercial. Las marcas preguntan por nosotros.',
      'Los patrocinadores están receptivos esta semana.',
      'Llegan oportunidades comerciales interesantes.',
    ],
  ],
  scouting_director: [
    [
      'Apenas hay nombres nuevos en el radar. Amplío la red.',
      'Pocos informes esta semana; toca rastrear más.',
      'El radar está tranquilo; busco nuevas pistas.',
    ],
    ['Estamos siguiendo a un par de futbolistas interesantes.'],
    [
      'La red de ojeadores trae informes muy buenos esta semana.',
      'Varios nombres interesantes han aparecido en el radar.',
      'Buena cosecha de informes de scouting.',
    ],
  ],
  finance_director: [
    [
      'El balance preocupa. Hay que vigilar gastos.',
      'Las cuentas aprietan; conviene recortar.',
      'Atención al gasto: la caja no acompaña.',
    ],
    ['Las cuentas van como deben. Nada destacable.'],
    [
      'Cuentas saneadas. Margen para alguna operación.',
      'Las finanzas respiran; hay colchón disponible.',
      'Balance sólido esta semana.',
    ],
  ],
  head_coach: [
    [
      'El vestuario está revuelto. Hablaré con los capitanes.',
      'Hay ruido en el grupo; toca gestionar.',
      'El ambiente está tenso; medio con los líderes.',
    ],
    ['Ambiente normal entre los jugadores. Trabajo táctico habitual.'],
    [
      'Vestuario unido y motivado. Buenas sensaciones.',
      'El grupo está enchufado; gran ambiente.',
      'Plantilla con la moral alta esta semana.',
    ],
  ],
};

/** Small stable hash of a staff id → seed component (keeps render deterministic). */
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return h;
}

/** Node the role checks in on (drives the bucket selection). */
const ROLE_NODE: Readonly<Record<StaffRole, keyof WorldState>> = {
  groundskeeper: 'field_quality' as keyof WorldState,
  fitness_coach: 'team_fitness' as keyof WorldState,
  commercial_director: 'fan_momentum' as keyof WorldState,
  scouting_director: 'scouting_points' as keyof WorldState,
  finance_director: 'financial_status' as keyof WorldState,
  head_coach: 'staff_morale' as keyof WorldState,
};

function bucket(value: number, role: StaffRole): 0 | 1 | 2 {
  // financial_status is 0-3 (0=Sano, 3=Quiebra). Invert: 0=Sano = high mood.
  if (role === 'finance_director') {
    if (value >= 2) return 0; // Crisis or Quiebra → "El balance preocupa"
    if (value >= 1) return 1; // En Riesgo → "normal"
    return 2;                 // Sano → "saneadas"
  }
  if (value < 40) return 0;
  if (value < 70) return 1;
  return 2;
}

/**
 * Emit ambient check-in messages, filtered to keep the inbox signal high.
 *
 * Pablo 2026-05-29: "no recibir todas las semanas noticias de que el césped
 * está bien, marea un poco y hace no ver las importantes". So:
 *   - LOW bucket (a problem) → always emit (the player needs to see it).
 *   - MID bucket ("nada destacable") → suppressed entirely (pure noise).
 *   - HIGH bucket (good news) → only ~1 week in `GOOD_NEWS_EVERY_N_WEEKS`,
 *     staggered per role, so positives are an occasional treat, not weekly spam.
 *
 * `week` drives the deterministic good-news gate (no Math.random).
 */
export function generateAmbientStaffMessages(args: {
  activeStaff: readonly ActiveStaff[];
  worldState: Readonly<WorldState>;
  week: number;
}): readonly AmbientMessage[] {
  const { activeStaff, worldState, week } = args;
  const out: AmbientMessage[] = [];

  for (const s of activeStaff) {
    const role = s.role as StaffRole;
    const templates = TEMPLATES_BY_ROLE[role];
    if (!templates) continue;

    const node = ROLE_NODE[role];
    const value = (worldState as unknown as Record<string, number>)[node as string] ?? 50;
    const b = bucket(value, role);

    // Noise filter: skip "nothing to report" (mid), ration good news (high).
    if (b === 1) continue;
    if (b === 2 && (week + roleSalt(role)) % GOOD_NEWS_EVERY_N_WEEKS !== 0) continue;

    // Seeded variant pick via the narrative engine (Sprint 26-9): same role +
    // week + bucket → same line, but varies across weeks. Deterministic.
    const variants = templates[b];
    const seed = week * 100 + (idHash(s.id) % 97) + b;
    const template = renderNarrative({ variants }, { seed }) || variants[0]!;
    const firstName = s.name.split(' ')[0] ?? 'Staff';
    const label = ROLE_LABEL[role] ?? role;

    out.push({
      staffId: s.id,
      templateKey: `ambient:${role}:${b}`,
      content: `${firstName} (${label}) comenta: ${template}`,
      priority: 'ROUTINE',
    });
  }

  return out;
}
