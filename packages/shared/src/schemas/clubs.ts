import { z } from 'zod';

export const divisionSchema = z.enum(['fifth', 'fourth', 'third', 'second', 'first']);

export const createClubSchema = z.object({
  name: z.string().min(2).max(64),
  city: z.string().min(2).max(64)
});

export const clubIdSchema = z.object({
  id: z.string().uuid()
});

export type CreateClubInput = z.infer<typeof createClubSchema>;
