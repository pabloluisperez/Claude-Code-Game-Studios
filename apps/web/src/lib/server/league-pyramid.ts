/**
 * Spanish league pyramid generator (Pablo 2026-05-26).
 *
 * Generates the full 5-tier structure procedurally:
 *   Tier 1 (Primera):   1 group × 20 clubs
 *   Tier 2 (Segunda):   1 group × 22 clubs
 *   Tier 3 (1ª RFEF):   2 groups × 20 clubs
 *   Tier 4 (2ª RFEF):   5 groups × 18 clubs
 *   Tier 5 (3ª RFEF):  18 groups × 18 clubs (user starts in group 0)
 *
 * Lightweight clubs only — name, city, kit, strength_rating. No players or
 * staff for AI clubs in distant divisions (per-tier perf optimisation).
 * The match-day runner uses strength_rating for strength-based sim on
 * non-user divisions.
 */

import type { Db } from '@smt/db';
import { clubs, divisions as divisionsTable, fixtures, seasons, standings } from '@smt/db';
import { generateDoubleRoundRobin } from '@smt/shared';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface TierSpec {
  readonly tier: 1 | 2 | 3 | 4 | 5;
  readonly name: string;
  readonly groupCount: number;
  readonly clubsPerGroup: number;
  /** Baseline strength for this tier (mean). Spread ±10 within the tier. */
  readonly baseStrength: number;
}

export const PYRAMID: readonly TierSpec[] = Object.freeze([
  { tier: 1, name: 'Primera División',  groupCount: 1,  clubsPerGroup: 20, baseStrength: 80 },
  { tier: 2, name: 'Segunda División',  groupCount: 1,  clubsPerGroup: 22, baseStrength: 65 },
  { tier: 3, name: 'Primera RFEF',      groupCount: 2,  clubsPerGroup: 20, baseStrength: 55 },
  { tier: 4, name: 'Segunda RFEF',      groupCount: 5,  clubsPerGroup: 18, baseStrength: 45 },
  { tier: 5, name: 'Tercera RFEF',      groupCount: 18, clubsPerGroup: 18, baseStrength: 35 },
]);

// Spanish city pool — 500+ unique cities + small towns. Used round-robin to
// spread clubs across regions. Sample below covers cities/towns from all
// regions; for tiny tier-5 groups we recycle smaller towns.
const SPANISH_CITIES: readonly string[] = [
  // Top metropolitan
  'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Bilbao',
  'Murcia', 'Palma', 'Las Palmas', 'Alicante', 'Córdoba', 'Valladolid', 'Vigo',
  'Gijón', 'Granada', 'Vitoria', 'A Coruña', 'Pamplona', 'Almería',
  // Major regional
  'Tarragona', 'Lleida', 'Girona', 'Cádiz', 'Huelva', 'Jerez', 'Cartagena',
  'Toledo', 'Burgos', 'Salamanca', 'Santander', 'Logroño', 'Badajoz', 'Cáceres',
  'León', 'Ourense', 'Lugo', 'Oviedo', 'Avilés', 'San Sebastián', 'Mérida',
  'Albacete', 'Castellón', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Soria',
  'Ávila', 'Segovia', 'Palencia', 'Zamora', 'Teruel', 'Huesca', 'Jaén',
  // Coastal + tourist
  'Marbella', 'Estepona', 'Algeciras', 'Tarifa', 'Benidorm', 'Torrevieja',
  'Mazarrón', 'Águilas', 'Lorca', 'Yecla', 'Manacor', 'Inca', 'Eivissa',
  'Maó', 'Arrecife', 'Telde', 'San Cristóbal', 'Santa Cruz', 'La Laguna',
  // Towns
  'Talavera', 'Aranjuez', 'Alcalá', 'Getafe', 'Leganés', 'Móstoles', 'Fuenlabrada',
  'Alcorcón', 'Parla', 'Coslada', 'Pinto', 'Valdemoro', 'Torrejón', 'Tres Cantos',
  'Sant Cugat', 'Mataró', 'Sabadell', 'Terrassa', 'Badalona', 'Hospitalet',
  'Reus', 'Manresa', 'Vic', 'Igualada', 'Vilanova', 'Cornellà', 'Granollers',
  'Mollet', 'Rubí', 'Sant Boi', 'Esplugues', 'Castelldefels',
  'Elche', 'Elda', 'Orihuela', 'Crevillente', 'Petrer', 'Villena', 'Dénia',
  'Gandía', 'Sagunto', 'Paterna', 'Burjassot', 'Torrent', 'Mislata', 'Catarroja',
  'Sueca', 'Cullera', 'Xàtiva', 'Alzira',
  'Mairena', 'Dos Hermanas', 'Alcalá de Guadaíra', 'Utrera', 'Écija', 'Carmona',
  'La Línea', 'Chiclana', 'San Fernando', 'El Puerto', 'Sanlúcar', 'Arcos',
  'Vélez-Málaga', 'Antequera', 'Ronda', 'Coín', 'Mijas', 'Fuengirola',
  'Motril', 'Loja', 'Guadix', 'Baza', 'Linares', 'Úbeda', 'Andújar', 'Martos',
  'Puertollano', 'Tomelloso', 'Valdepeñas', 'Manzanares', 'Alcázar', 'Hellín',
  'Almansa', 'Villarrobledo', 'Caudete',
  'Lugones', 'Mieres', 'Langreo', 'Laviana', 'Sama', 'Pola de Siero',
  'Torrelavega', 'Castro', 'Laredo', 'Reinosa', 'Camargo',
  'Barakaldo', 'Getxo', 'Sestao', 'Portugalete', 'Basauri', 'Durango',
  'Eibar', 'Irún', 'Renteria', 'Hondarribia', 'Tolosa', 'Beasain', 'Mondragón',
  'Estella', 'Tudela', 'Tafalla', 'Sangüesa', 'Olite', 'Roncal',
  'Calahorra', 'Haro', 'Arnedo', 'Nájera',
  'Manlleu', 'Olot', 'Banyoles', 'Figueres', 'Palamós', 'Roses', 'Blanes',
  'Lloret', 'Tossa', 'Salt', 'Sant Feliu',
  'Cervera', 'Tàrrega', 'Mollerussa', 'Balaguer', 'Vielha', 'Tremp',
  // Galicia
  'Ferrol', 'Carballo', 'Ribeira', 'Padrón', 'Noia', 'Boiro', 'Cangas',
  'Marín', 'Pontevedra', 'Vilagarcía', 'Cambados', 'Tui', 'Redondela',
  'Verín', 'Monforte', 'Sarria', 'Vilalba', 'Foz', 'Burela', 'Ribadeo',
  // Más pueblos
  'Plasencia', 'Coria', 'Trujillo', 'Don Benito', 'Almendralejo', 'Olivenza',
  'Zafra', 'Villanueva', 'Fregenal', 'Llerena',
  'Calatayud', 'Tarazona', 'Ejea', 'Jaca', 'Monzón', 'Barbastro', 'Sariñena',
  'Alcañiz', 'Andorra', 'Calanda',
  'Sigüenza', 'Molina', 'Pastrana', 'Brihuega', 'Hita', 'Sacedón',
  'Almagro', 'Daimiel', 'Bolaños', 'Membrilla', 'Argamasilla',
  'Aranda', 'Miranda', 'Briviesca', 'Lerma', 'Roa', 'Belorado', 'Pancorbo',
  'Béjar', 'Ciudad Rodrigo', 'Peñaranda', 'Vitigudino', 'Ledesma',
  'Aranda de Duero', 'Burgo de Osma', 'Almazán', 'Ágreda',
  'El Espinar', 'Cuéllar', 'Sepúlveda', 'Riaza',
  'Astorga', 'Ponferrada', 'Bembibre', 'La Bañeza', 'Sahagún', 'Valencia de Don Juan',
];

const CLUB_PATTERNS: ReadonlyArray<(city: string) => string> = [
  (c) => `${c} CF`,
  (c) => `${c} FC`,
  (c) => `Real ${c}`,
  (c) => `Atlético ${c}`,
  (c) => `Deportivo ${c}`,
  (c) => `${c} Unión`,
  (c) => `Sporting ${c}`,
  (c) => `Club ${c}`,
  (c) => `${c} Balompié`,
  (c) => `Racing ${c}`,
];

const KIT_COLORS: readonly string[] = [
  '#1e3a8a', '#7c2d12', '#15803d', '#a16207', '#86198f', '#7e22ce', '#0e7490',
  '#b91c1c', '#581c87', '#155e75', '#166534', '#92400e', '#9f1239', '#1e40af',
  '#374151', '#0c4a6e', '#365314', '#854d0e', '#831843', '#312e81', '#27272a',
  '#f8fafc', '#e7e5e4', '#fef3c7', '#fee2e2', '#d1fae5', '#dbeafe', '#fae8ff',
];

function pickKitColors(seedFn: () => number): { primary: string; secondary: string } {
  const i = Math.floor(seedFn() * KIT_COLORS.length);
  let j = Math.floor(seedFn() * KIT_COLORS.length);
  if (j === i) j = (j + 1) % KIT_COLORS.length;
  return { primary: KIT_COLORS[i]!, secondary: KIT_COLORS[j]! };
}

interface GeneratedClub {
  name: string;
  city: string;
  tier: 1 | 2 | 3 | 4 | 5;
  groupIndex: number;
  strengthRating: number;
  kitPrimaryColor: string;
  kitSecondaryColor: string;
  cityTier: number;
}

/**
 * Generate the lightweight club pool for ALL divisions except the user's
 * own group. The caller provides:
 *   - The user's tier + group (typically tier=5, groupIndex=0)
 *   - List of existing club names to avoid duplicates
 *
 * Returns ~482 clubs (total pyramid minus user's group's clubCount).
 */
export function generatePyramidClubs(args: {
  rng: () => number;
  userTier: 1 | 2 | 3 | 4 | 5;
  userGroupIndex: number;
  excludeNames: ReadonlySet<string>;
}): GeneratedClub[] {
  const out: GeneratedClub[] = [];
  const usedNames = new Set(args.excludeNames);
  let cityIdx = 0;

  for (const spec of PYRAMID) {
    for (let g = 0; g < spec.groupCount; g++) {
      const isUserGroup = spec.tier === args.userTier && g === args.userGroupIndex;
      // For the user's group, we still need (clubsPerGroup - 1) AI clubs to
      // round out the league. The user's own club is inserted separately.
      const aiCount = isUserGroup ? spec.clubsPerGroup - 1 : spec.clubsPerGroup;

      for (let c = 0; c < aiCount; c++) {
        let name: string;
        let city: string;
        let attempts = 0;
        do {
          city = SPANISH_CITIES[cityIdx % SPANISH_CITIES.length]!;
          cityIdx++;
          const patternIdx = Math.floor(args.rng() * CLUB_PATTERNS.length);
          name = CLUB_PATTERNS[patternIdx]!(city);
          attempts++;
        } while (usedNames.has(name) && attempts < 20);
        usedNames.add(name);

        // Strength: baseline ± 10 jitter, deterministic.
        const strength = Math.max(
          15,
          Math.min(95, spec.baseStrength + Math.floor(args.rng() * 21) - 10),
        );

        const kit = pickKitColors(args.rng);

        // cityTier loose mapping: top 20 cities = tier 4, next 50 = tier 3, etc.
        const cityRank = (cityIdx - 1) % SPANISH_CITIES.length;
        const cityTier = cityRank < 20 ? 4 : cityRank < 70 ? 3 : cityRank < 150 ? 2 : 1;

        out.push({
          name,
          city,
          tier: spec.tier,
          groupIndex: g,
          strengthRating: strength,
          kitPrimaryColor: kit.primary,
          kitSecondaryColor: kit.secondary,
          cityTier,
        });
      }
    }
  }

  return out;
}

/**
 * Persist all divisions + clubs + initial fixtures + standings for a brand-new
 * playthrough that uses the Spanish pyramid structure.
 *
 * The caller is responsible for inserting the user's own club row separately
 * (with the same tier/groupIndex as `userTier`/`userGroupIndex`).
 */
export async function persistPyramid(
  tx: Tx,
  args: {
    leagueId: string;
    playthroughId: string;
    userClubId: string;
    userTier: 1 | 2 | 3 | 4 | 5;
    userGroupIndex: number;
    rng: () => number;
    seasonStartWeek: number;
    excludeClubNames: ReadonlySet<string>;
  },
): Promise<{
  userDivisionId: string;
  userSeasonId: string;
}> {
  // 1. Create all 27 divisions.
  const divisionRows: Array<{ id: string; tier: number; groupIndex: number; clubCount: number }> = [];
  for (const spec of PYRAMID) {
    for (let g = 0; g < spec.groupCount; g++) {
      const label = spec.groupCount > 1 ? ` Grupo ${g + 1}` : '';
      const [row] = await tx
        .insert(divisionsTable)
        .values({
          leagueId: args.leagueId,
          tier: spec.tier,
          groupIndex: g,
          name: `${spec.name}${label}`,
          clubCount: spec.clubsPerGroup,
        })
        .returning({ id: divisionsTable.id });
      divisionRows.push({ id: row.id, tier: spec.tier, groupIndex: g, clubCount: spec.clubsPerGroup });
    }
  }

  // 2. Generate + insert AI clubs.
  const aiClubs = generatePyramidClubs({
    rng: args.rng,
    userTier: args.userTier,
    userGroupIndex: args.userGroupIndex,
    excludeNames: args.excludeClubNames,
  });

  // Map division key (tier:groupIndex) → division UUID.
  const divKey = (t: number, g: number) => `${t}:${g}`;
  const divIdByKey = new Map(divisionRows.map((d) => [divKey(d.tier, d.groupIndex), d.id]));

  // Bulk-insert AI clubs (lightweight — no players).
  const aiClubRows = await tx
    .insert(clubs)
    .values(
      aiClubs.map((c) => ({
        managerId: null,
        name: c.name,
        city: c.city,
        division: c.tier === 1 ? 'first' as const
          : c.tier === 2 ? 'second' as const
          : c.tier === 3 ? 'third' as const
          : c.tier === 4 ? 'fourth' as const
          : 'fifth' as const,
        tier: c.tier,
        groupIndex: c.groupIndex,
        strengthRating: c.strengthRating,
        prestige: c.tier === 1 ? 4 : c.tier === 2 ? 3 : c.tier === 3 ? 2 : 1,
        budget: 5000 + (5 - c.tier) * 3000,
        fanBase: 500 + (5 - c.tier) * 2000,
        cityTier: c.cityTier,
        currentSeason: 1,
        kitPrimaryColor: c.kitPrimaryColor,
        kitSecondaryColor: c.kitSecondaryColor,
      })),
    )
    .returning({ id: clubs.id, tier: clubs.tier, groupIndex: clubs.groupIndex });

  // 3. For each division, collect club IDs (AI + user if applicable).
  const clubsByDiv = new Map<string, string[]>();
  for (const c of aiClubRows) {
    const k = divKey(c.tier, c.groupIndex);
    const arr = clubsByDiv.get(k) ?? [];
    arr.push(c.id);
    clubsByDiv.set(k, arr);
  }
  // Add user club to its division group.
  const userKey = divKey(args.userTier, args.userGroupIndex);
  const userDivArr = clubsByDiv.get(userKey) ?? [];
  userDivArr.push(args.userClubId);
  clubsByDiv.set(userKey, userDivArr);

  // 4. For each division: create season + fixtures + standings.
  let userDivisionId = '';
  let userSeasonId = '';

  for (const div of divisionRows) {
    const k = divKey(div.tier, div.groupIndex);
    const ids = clubsByDiv.get(k) ?? [];
    if (ids.length < 2) continue;

    // Matchdays = (N-1) × 2 for double round-robin.
    const matchdays = (ids.length - 1) * 2;
    const endWeek = args.seasonStartWeek + matchdays - 1;
    const [season] = await tx
      .insert(seasons)
      .values({
        leagueId: args.leagueId,
        divisionId: div.id,
        seasonNumber: 1,
        status: 'active',
        startWeek: args.seasonStartWeek,
        endWeek,
      })
      .returning({ id: seasons.id });

    if (k === userKey) {
      userDivisionId = div.id;
      userSeasonId = season.id;
    }

    const pairs = generateDoubleRoundRobin({
      clubIds: ids,
      startWeek: args.seasonStartWeek,
    });

    await tx.insert(fixtures).values(
      pairs.map((p) => ({
        seasonId: season.id,
        divisionId: div.id,
        homeClubId: p.homeClubId,
        awayClubId: p.awayClubId,
        week: p.week,
        matchday: p.matchday,
        status: 'scheduled' as const,
      })),
    );

    await tx.insert(standings).values(
      ids.map((id) => ({
        seasonId: season.id,
        divisionId: div.id,
        clubId: id,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      })),
    );
  }

  return { userDivisionId, userSeasonId };
}
