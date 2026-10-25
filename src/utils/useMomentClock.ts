import { useEffect, useState } from 'react';
import { nextMomentRefreshDelayMs } from './momentClock';

/**
 * 25/10 · Lot E : heure courante qui se met à jour seule à H−1 h (chat, fin du désistement gratuit), H−15,
 * H, H+30, H+6 et toutes les 30 s autour du moment, pour que les boutons qui
 * dépendent de l’heure apparaissent ou disparaissent sans action manuelle.
 */
export function useMomentClock(startsAt: string | undefined): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!startsAt) return undefined;
    const startMs = new Date(startsAt).getTime();
    const delay = nextMomentRefreshDelayMs(startMs, Date.now());
    if (delay === null) return undefined;
    const t = setTimeout(() => setNowMs(Date.now()), delay);
    return () => clearTimeout(t);
  }, [startsAt, nowMs]);
  return nowMs;
}
