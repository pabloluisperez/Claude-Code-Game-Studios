/**
 * Spanish-biased name pool for procedural player generation.
 * Bounded, deterministic — selected via ctx.rng().
 *
 * Story: PLAYER-MANAGEMENT-003
 */

export const FIRST_NAMES: readonly string[] = Object.freeze([
  'Alejandro', 'Mateo', 'Lucas', 'Daniel', 'Pablo', 'Diego', 'Sergio', 'Adrián',
  'Hugo', 'Álvaro', 'Mario', 'David', 'Iván', 'Carlos', 'Javier', 'Manuel',
  'Antonio', 'Jorge', 'Rubén', 'Óscar', 'Marcos', 'Raúl', 'Marc', 'Pol',
  'Iker', 'Aitor', 'Jon', 'Nicolás', 'Samuel', 'Bruno', 'Martín', 'Andrés',
  'Vicente', 'Pedro', 'Joaquín', 'Roberto', 'Fernando', 'Gabriel', 'Joel', 'Eric',
]);

export const LAST_NAMES: readonly string[] = Object.freeze([
  'García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez',
  'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno',
  'Muñoz', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro', 'Torres',
  'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Ramírez', 'Serrano', 'Blanco',
  'Suárez', 'Molina', 'Morales', 'Ortega', 'Delgado', 'Castro', 'Ortiz',
  'Rubio', 'Marín', 'Sanz', 'Iglesias', 'Núñez', 'Medina', 'Garrido',
]);

/** Pick a name pair using a single rng() call sequence — deterministic. */
export function pickName(rng: () => number): { firstName: string; lastName: string } {
  const fIdx = Math.floor(rng() * FIRST_NAMES.length);
  const lIdx = Math.floor(rng() * LAST_NAMES.length);
  return {
    firstName: FIRST_NAMES[fIdx]!,
    lastName: LAST_NAMES[lIdx]!,
  };
}
