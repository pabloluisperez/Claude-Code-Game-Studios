import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { loadLeagueView } from '$lib/server/league-view';

export const load: PageServerLoad = async ({ parent, url }) => {
  const { user, activePlaythrough } = await parent();
  if (!user) throw redirect(303, '/login');
  if (!activePlaythrough) return { hasPlaythrough: false as const };
  return loadLeagueView(activePlaythrough, url);
};
