/**
 * Display labels + descriptive text for calendar_event types.
 *
 * Story: Event i18n
 * Control Manifest: 2026-05-20
 */

export interface EventDisplay {
  label: string;
  description: string;
  icon: string;
}

const FALLBACK: EventDisplay = {
  label: 'Evento',
  description: 'Evento del calendario.',
  icon: '•',
};

const TABLE: Readonly<Record<string, EventDisplay>> = Object.freeze({
  season_start: {
    label: 'Inicio de temporada',
    description: 'Arranca la temporada oficial de liga.',
    icon: '🗓',
  },
  season_end: {
    label: 'Fin de temporada',
    description: 'Termina la temporada — momento de balance.',
    icon: '🏁',
  },
  transfer_window_open: {
    label: 'Apertura mercado',
    description: 'Se abre la ventana de fichajes.',
    icon: '💼',
  },
  transfer_window_close: {
    label: 'Cierre mercado',
    description: 'Se cierra la ventana de fichajes — última oportunidad.',
    icon: '🚪',
  },
  sponsor_offer: {
    label: 'Oferta de patrocinio',
    description:
      'Una marca propone un contrato. Decide si la firmas o esperas una mejor.',
    icon: '🤝',
  },
  sponsor_renewal: {
    label: 'Renovación patrocinador',
    description:
      'Un patrocinador actual quiere renovar. Acepta o rechaza la nueva oferta.',
    icon: '🔁',
  },
  board_meeting: {
    label: 'Reunión de directiva',
    description:
      'La directiva quiere revisar la marcha del equipo. Tu respuesta marcará sus expectativas y tu margen de presión.',
    icon: '🏛',
  },
  board_meeting_crisis: {
    label: 'Reunión de crisis',
    description:
      'La directiva está preocupada por la situación. Necesitan oír un plan creíble.',
    icon: '⚠️',
  },
  transfer_offer: {
    label: 'Oferta de fichaje',
    description: 'Otro club hace una oferta por uno de tus jugadores.',
    icon: '💸',
  },
  contract_renewal: {
    label: 'Renovación de jugador',
    description: 'El agente pide renovar el contrato con nuevas condiciones.',
    icon: '📄',
  },
  youth_promotion: {
    label: 'Promoción cantera',
    description: 'Un canterano destaca y pide subir al primer equipo.',
    icon: '🌱',
  },
  scandal: {
    label: 'Escándalo',
    description:
      'Ha salido un escándalo en la prensa. Tu reacción afecta al ánimo del vestuario y a los patrocinadores.',
    icon: '🗞',
  },
  corruption_caught: {
    label: 'Corrupción descubierta',
    description: 'Se ha descubierto un caso de corrupción que afecta al club.',
    icon: '🚨',
  },
  alcalde_meeting: {
    label: 'Reunión con el alcalde',
    description: 'El alcalde quiere hablar sobre el club y la ciudad.',
    icon: '🏛',
  },
  external_manager_offer: {
    label: 'Oferta externa',
    description: 'Otro club te ha llamado para ofrecerte el banquillo.',
    icon: '📞',
  },
  stadium_upgrade_offer: {
    label: 'Mejora del estadio',
    description: 'Hay una propuesta para mejorar las instalaciones.',
    icon: '🏟',
  },
  nomina_frozen: {
    label: 'Nómina congelada',
    description: 'No se pueden pagar las nóminas este mes. Decide cómo actuar.',
    icon: '🧊',
  },
  tv_auction: {
    label: 'Subasta derechos TV',
    description:
      'Las cadenas pujan por los derechos de televisión del club. Elige tier y duración en Derechos TV.',
    icon: '📺',
  },
  tv_midseason_offer: {
    label: 'Oferta TV a media temporada',
    description:
      'Una cadena mejora su oferta a mitad de temporada. Revísala en Derechos TV.',
    icon: '📺',
  },
});

export function eventDisplay(type: string): EventDisplay {
  return TABLE[type] ?? FALLBACK;
}

/**
 * Returns true if this event type requires a player decision (STOP-priority).
 * Used by /inbox to surface action links.
 */
export function eventNeedsAction(type: string, priority?: string): boolean {
  if (priority === 'STOP') return true;
  return [
    'sponsor_offer',
    'sponsor_renewal',
    'board_meeting',
    'board_meeting_crisis',
    'transfer_offer',
    'contract_renewal',
    'youth_promotion',
    'scandal',
    'external_manager_offer',
    'stadium_upgrade_offer',
    'nomina_frozen',
  ].includes(type);
}
