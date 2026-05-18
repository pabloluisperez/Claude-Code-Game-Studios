import { eq } from 'drizzle-orm';
import { db, clubs } from '@smt/db';
import type { Club, NewClub } from '@smt/db';

export async function findClubById(id: string): Promise<Club | undefined> {
  return db.query.clubs.findFirst({ where: eq(clubs.id, id) });
}

export async function findClubsByManager(managerId: string): Promise<Club[]> {
  return db.query.clubs.findMany({ where: eq(clubs.managerId, managerId) });
}

export async function createClub(data: Omit<NewClub, 'id' | 'createdAt' | 'updatedAt'>): Promise<Club> {
  const [club] = await db.insert(clubs).values(data).returning();
  if (!club) throw new Error('Failed to create club');
  return club;
}

export async function updateClub(id: string, data: Partial<NewClub>): Promise<Club | undefined> {
  const [updated] = await db
    .update(clubs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(clubs.id, id))
    .returning();
  return updated;
}
