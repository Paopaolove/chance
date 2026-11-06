import type { AppState, Outing } from '../data/types';
import { isOutingFinishedOrPastStart, isVisibleOnAnnoncesFeed } from './outingActive';

/** Ne change que les signets du compte courant, jamais les demandes ni les places. */
export function toggleBookmark(state: AppState, outingId: string): AppState {
  const userId = state.currentUser?.id;
  if (!userId || !state.outings.some((outing) => outing.id === outingId)) return state;
  const ids = state.bookmarksByUser?.[userId] ?? [];
  return {
    ...state,
    bookmarksByUser: {
      ...state.bookmarksByUser,
      [userId]: ids.includes(outingId)
        ? ids.filter((id) => id !== outingId)
        : [...ids, outingId],
    },
  };
}

/** Filtre d’affichage seulement : une place libérée fait réapparaître le signet. */
export function bookmarkedOutings(state: AppState, nowMs = Date.now()): Outing[] {
  const userId = state.currentUser?.id;
  if (!userId) return [];
  const ids = new Set(state.bookmarksByUser?.[userId] ?? []);
  return state.outings.filter((outing) =>
    ids.has(outing.id) &&
    !isOutingFinishedOrPastStart(outing, nowMs) &&
    isVisibleOnAnnoncesFeed(outing, nowMs),
  );
}
