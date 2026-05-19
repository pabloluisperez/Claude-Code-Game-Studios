import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { db, matchSessions, eq } from '@smt/db';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { user } = await parent();
  if (!user) throw redirect(303, '/login');

  const [session] = await db
    .select()
    .from(matchSessions)
    .where(eq(matchSessions.id, params.matchSessionId))
    .limit(1);

  if (!session) throw error(404, 'Match session not found');

  return { session };
};
