import { writable } from 'svelte/store';

/**
 * True while a live match replay is in progress. The root layout uses it to
 * lock the sidebar + topbar nav so the user can't wander off mid-match — they
 * must finish it or hit "Saltar al final" / "Volver al dashboard" (both live in
 * the match page's own content, which stays interactive). Pablo 2026-05-30.
 *
 * The match page is responsible for setting it true when the replay starts and
 * false on final whistle / skip / unmount.
 */
export const matchLock = writable(false);
