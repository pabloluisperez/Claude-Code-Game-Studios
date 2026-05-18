import type { Club } from '@smt/db';
import type { CreateClubInput } from '@smt/shared';
import { createClub, findClubById, findClubsByManager } from './repo.js';

export async function getClub(id: string): Promise<Club | null> {
  return (await findClubById(id)) ?? null;
}

export async function getManagerClubs(managerId: string): Promise<Club[]> {
  return findClubsByManager(managerId);
}

export async function foundClub(managerId: string, input: CreateClubInput): Promise<Club> {
  return createClub({
    managerId,
    name: input.name,
    city: input.city,
    division: 'fifth',
    prestige: 1,
    budget: 10000,
    fanBase: 500,
    cityTier: 1,
    currentSeason: 1
  });
}
