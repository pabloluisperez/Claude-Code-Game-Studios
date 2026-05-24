/**
 * Staff message template resolver.
 *
 * Per ADR-009 §Template Library:
 *   Key format: `{StaffRole}:{NodeId}:{direction}:{tier}`
 *   Direction: 'above' (value went up) | 'below' (value went down)
 *   Tier-3 messages are 2-3× longer than tier-1 (causal explanation vs vague).
 *
 * Pure functions. No DB.
 *
 * Story: STAFF-SYSTEM-002 (TR-STAFF-002)
 * Control Manifest: 2026-05-19
 */

import type {
  MessageDirection,
  MessagePriority,
  StaffQualityTier,
  StaffRole,
} from './types.js';

/**
 * Template library — every (role × nodeId × direction × tier) combo has a
 * Spanish-language message. Tier-3 messages explain causation; tier-1 are vague.
 */
export const STAFF_MESSAGE_TEMPLATES: Readonly<Record<string, string>> = Object.freeze({
  // groundskeeper × field_quality
  'groundskeeper:field_quality:below:1': 'El campo está deteriorándose.',
  'groundskeeper:field_quality:below:2': 'El campo necesita atención — los jugadores están notando el estado del césped.',
  'groundskeeper:field_quality:below:3': 'El deterioro del campo está aumentando el riesgo de lesiones. Invertir esta semana evitaría problemas en los próximos partidos.',
  'groundskeeper:field_quality:above:1': 'El campo está mejor.',
  'groundskeeper:field_quality:above:2': 'El campo ha mejorado — los jugadores estarán más cómodos.',
  'groundskeeper:field_quality:above:3': 'El campo está en buenas condiciones. Esto debería reducir el riesgo de lesiones de cara al partido.',

  // fitness_coach × team_fitness
  'fitness_coach:team_fitness:below:1': 'Los jugadores se ven cansados.',
  'fitness_coach:team_fitness:below:2': 'El equipo está acumulando fatiga — varios jugadores no llegan al partido al 100%.',
  'fitness_coach:team_fitness:below:3': 'Recomiendo bajar la intensidad del entrenamiento esta semana. La fatiga acumulada va a costar puntos si no se gestiona.',
  'fitness_coach:team_fitness:above:1': 'Los chicos están bien físicamente.',
  'fitness_coach:team_fitness:above:2': 'La forma física del equipo es buena — la respuesta al entrenamiento está siendo positiva.',
  'fitness_coach:team_fitness:above:3': 'El equipo está en gran forma física. Es un buen momento para mantener la intensidad táctica en el partido.',

  // fitness_coach × injury_risk
  'fitness_coach:injury_risk:above:1': 'Algunos jugadores se quejan de molestias.',
  'fitness_coach:injury_risk:above:2': 'El riesgo de lesiones está subiendo — el médico también lo ha notado.',
  'fitness_coach:injury_risk:above:3': 'Riesgo de lesión elevado. Combinar la fatiga acumulada con la intensidad actual del entrenamiento es la causa principal — ajustar uno de los dos.',
  'fitness_coach:injury_risk:below:1': 'No hay problemas físicos.',
  'fitness_coach:injury_risk:below:2': 'El riesgo de lesiones está controlado esta semana.',
  'fitness_coach:injury_risk:below:3': 'Riesgo de lesión bajo. La gestión del entrenamiento y la recuperación está funcionando bien.',

  // commercial_director × fan_momentum
  'commercial_director:fan_momentum:below:1': 'Los aficionados están desanimados.',
  'commercial_director:fan_momentum:below:2': 'El momentum de la afición está bajando — se nota en las redes y en la asistencia.',
  'commercial_director:fan_momentum:below:3': 'La caída del momentum se debe principalmente a los últimos resultados. Una victoria en casa esta semana sería clave para frenarlo.',
  'commercial_director:fan_momentum:above:1': 'Los aficionados están contentos.',
  'commercial_director:fan_momentum:above:2': 'El momentum de la afición es bueno — buena ola.',
  'commercial_director:fan_momentum:above:3': 'El momentum es muy alto. Es un buen momento para subir el precio de las entradas sin que protesten.',

  // commercial_director × sponsor_quality
  'commercial_director:sponsor_quality:above:1': 'Llegan ofertas de patrocinio.',
  'commercial_director:sponsor_quality:above:2': 'El interés de marcas está creciendo — podríamos negociar un nuevo patrocinador.',
  'commercial_director:sponsor_quality:above:3': 'El nivel de patrocinio refleja la reputación del club. Es buen momento para renegociar contratos al alza con el patrocinador principal.',
  'commercial_director:sponsor_quality:below:1': 'Los patrocinadores se inquietan.',
  'commercial_director:sponsor_quality:below:2': 'El patrocinio principal está reduciendo su exposición — habría que dar señales positivas.',
  'commercial_director:sponsor_quality:below:3': 'Caída del valor de patrocinio. Vinculado al rendimiento deportivo y al ruido mediático — necesitamos contrarrestar con resultados o gestión de imagen.',

  // commercial_director × fan_attendance
  'commercial_director:fan_attendance:above:1': 'Más gente en el estadio.',
  'commercial_director:fan_attendance:above:2': 'La asistencia está subiendo esta semana.',
  'commercial_director:fan_attendance:above:3': 'La asistencia está respondiendo al momentum. Subir entradas ahora maximizaría ingresos sin perder público.',
  'commercial_director:fan_attendance:below:1': 'Hay butacas vacías.',
  'commercial_director:fan_attendance:below:2': 'La asistencia cae — los precios podrían estar disuadiendo a los aficionados habituales.',
  'commercial_director:fan_attendance:below:3': 'Caída de asistencia ligada al precio o a la pérdida de momentum. Bajar el precio temporalmente y comunicar la ayuda al club podría recuperarla.',

  // scouting_director × scouting_points
  'scouting_director:scouting_points:above:1': 'El ojeo va bien.',
  'scouting_director:scouting_points:above:2': 'Hay nombres en el radar — un par de promesas asequibles.',
  'scouting_director:scouting_points:above:3': 'Tenemos información de calidad sobre varios jugadores objetivo. Es el momento ideal para preparar la próxima ventana de fichajes.',
  'scouting_director:scouting_points:below:1': 'El ojeo está parado.',
  'scouting_director:scouting_points:below:2': 'Faltan informes recientes — ampliar el equipo de scouting ayudaría.',
  'scouting_director:scouting_points:below:3': 'Sin información reciente del mercado, llegaremos tarde a la próxima ventana. Reforzar el presupuesto de scouting esta semana.',

  // scouting_director × squad_available_pct
  'scouting_director:squad_available_pct:below:1': 'Tenemos bajas.',
  'scouting_director:squad_available_pct:below:2': 'La plantilla disponible es ajustada — convendría incorporar antes de la próxima ventana.',
  'scouting_director:squad_available_pct:below:3': 'Riesgo de forfeit si llegan más bajas. La gestión médica y la rotación de la plantilla son clave esta semana.',
  'scouting_director:squad_available_pct:above:1': 'La plantilla está más completa.',
  'scouting_director:squad_available_pct:above:2': 'Han vuelto jugadores — más opciones tácticas.',
  'scouting_director:squad_available_pct:above:3': 'Plantilla casi al completo. Buen momento para mantener una rotación amplia y proteger a los titulares.',

  // finance_director × financial_balance
  'finance_director:financial_balance:below:1': 'Las cuentas están justas.',
  'finance_director:financial_balance:below:2': 'El balance cae — toca contener gastos no esenciales.',
  'finance_director:financial_balance:below:3': 'Balance en zona de riesgo. Si esto continúa 2-3 semanas más entraremos en Crisis financiera con consecuencias en el vestuario.',
  'finance_director:financial_balance:above:1': 'La caja respira.',
  'finance_director:financial_balance:above:2': 'El balance mejora — hay margen para inversiones controladas.',
  'finance_director:financial_balance:above:3': 'Balance saludable. Es el momento idóneo para inversiones estratégicas en stadium o staff con horizonte 3-4 temporadas.',

  // finance_director × weekly_cashflow
  'finance_director:weekly_cashflow:below:1': 'Cerramos la semana en negativo.',
  'finance_director:weekly_cashflow:below:2': 'Cashflow negativo — los costes superan los ingresos esta semana.',
  'finance_director:weekly_cashflow:below:3': 'Cashflow negativo sostenido. La salida principal es nómina; el lado de ingresos depende de asistencia + patrocinio. Revisar ambas palancas.',
  'finance_director:weekly_cashflow:above:1': 'La semana fue positiva.',
  'finance_director:weekly_cashflow:above:2': 'Cashflow positivo gracias a los ingresos del partido.',
  'finance_director:weekly_cashflow:above:3': 'Excedente saludable esta semana. Mantener el ritmo de ingresos via attendance permitiría inversiones a medio plazo.',

  // finance_director × financial_status
  'finance_director:financial_status:above:1': 'Las cuentas están más comprometidas.',
  'finance_director:financial_status:above:2': 'Hemos cambiado de zona financiera — convendría tomar medidas.',
  'finance_director:financial_status:above:3': 'Transición a estado financiero peor. Si seguimos así, los patrocinadores y la directiva van a empezar a presionar.',
  'finance_director:financial_status:below:1': 'Las cuentas están mejor.',
  'finance_director:financial_status:below:2': 'Hemos salido de la zona de riesgo financiero.',
  'finance_director:financial_status:below:3': 'Recuperación financiera consolidada. Las medidas tomadas están funcionando — mantener disciplina de gasto.',

  // head_coach × staff_morale
  'head_coach:staff_morale:below:1': 'El cuerpo técnico está tenso.',
  'head_coach:staff_morale:below:2': 'La moral del staff baja — hay quejas en el vestuario técnico.',
  'head_coach:staff_morale:below:3': 'Moral del staff técnico afectada. Si se cronifica, la calidad del entrenamiento y de la preparación del partido se resentirá.',
  'head_coach:staff_morale:above:1': 'El cuerpo técnico está animado.',
  'head_coach:staff_morale:above:2': 'Buena moral en el staff — se nota en los entrenamientos.',
  'head_coach:staff_morale:above:3': 'Excelente moral del staff técnico. Esto se traduce en sesiones más exigentes y mejor preparación de partido — aprovechar el momento.',

  // head_coach × player_happiness
  'head_coach:player_happiness:below:1': 'El vestuario está raro.',
  'head_coach:player_happiness:below:2': 'Hay malestar entre los jugadores — algunos están descontentos con su rol o el trato.',
  'head_coach:player_happiness:below:3': 'Vestuario afectado. La combinación de derrotas y rotación está minando la felicidad — necesitamos victorias y diálogo individual.',
  'head_coach:player_happiness:above:1': 'El vestuario va bien.',
  'head_coach:player_happiness:above:2': 'Buen ambiente entre los jugadores esta semana.',
  'head_coach:player_happiness:above:3': 'Vestuario en muy buen momento. Es la base para una racha — los jugadores rinden más cuando el grupo está unido.',

  // head_coach × match_performance_index
  'head_coach:match_performance_index:above:1': 'Han jugado bien.',
  'head_coach:match_performance_index:above:2': 'Buen rendimiento sobre el campo en el último partido.',
  'head_coach:match_performance_index:above:3': 'Excelente nivel de juego — el equipo se está acercando a su techo táctico. Mantener la formación y la rotación actual.',
  'head_coach:match_performance_index:below:1': 'El partido no fue bueno.',
  'head_coach:match_performance_index:below:2': 'El rendimiento ha caído respecto a los últimos partidos.',
  'head_coach:match_performance_index:below:3': 'Caída clara de rendimiento. La causa probable es la fatiga combinada con cambios tácticos recientes — revisar uno de los dos antes del próximo partido.',
});

export const TEMPLATE_FALLBACK: Readonly<Record<MessagePriority, string>> = Object.freeze({
  URGENT: 'Hay una situación urgente que requiere tu atención.',
  ROUTINE: 'Hay novedades en el club esta semana.',
});

export interface ResolveTemplateArgs {
  readonly role: StaffRole;
  readonly nodeId: string;
  readonly direction: MessageDirection;
  readonly tier: StaffQualityTier;
  readonly priority: MessagePriority;
}

/**
 * Resolve a template key to the rendered message body. Returns the fallback
 * (priority-specific) when no template matches.
 */
export function resolveMessageTemplate(
  args: Readonly<ResolveTemplateArgs>,
): { templateKey: string; content: string; isFallback: boolean } {
  const templateKey = `${args.role}:${args.nodeId}:${args.direction}:${args.tier}`;
  const content = STAFF_MESSAGE_TEMPLATES[templateKey];
  if (content !== undefined) {
    return { templateKey, content, isFallback: false };
  }
  return {
    templateKey,
    content: TEMPLATE_FALLBACK[args.priority],
    isFallback: true,
  };
}
