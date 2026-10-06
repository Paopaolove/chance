import { parisYmd } from './parisTime';

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export type FreeDateResult =
  | { ok: true; ymd: string }
  | { ok: false; reason: 'empty' | 'incomplete' | 'invalid' | 'past' };

/**
 * Date libre « Autre » : JJ/MM, JJ/MM/AA ou JJ/MM/AAAA (séparateurs / . -).
 * Sans année → année en cours, ou l’an prochain si la date est déjà passée.
 * Année explicite dans le passé → `past` (jamais de crash).
 */
export function parseFreeDate(raw: string, nowMs = Date.now()): FreeDateResult {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, reason: 'empty' };
  const m = /^(\d{1,2})[\/.\-\s](\d{1,2})(?:[\/.\-\s](\d{2}|\d{4}))?$/.exec(s);
  if (!m) {
    return /^\d{1,2}([\/.\-\s]\d{0,2}([\/.\-\s]\d{0,3})?)?$/.test(s)
      ? { ok: false, reason: 'incomplete' }
      : { ok: false, reason: 'invalid' };
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  const today = parisYmd(nowMs);
  const currentYear = Number(today.slice(0, 4)) || new Date(nowMs).getFullYear();
  let year: number;
  if (m[3]) {
    year = Number(m[3]);
    if (m[3].length === 2) year += 2000;
  } else {
    year = currentYear;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, reason: 'invalid' };
  }
  const probe = new Date(year, month - 1, day);
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return { ok: false, reason: 'invalid' };
  }
  let ymd = `${year}-${pad2(month)}-${pad2(day)}`;
  if (today && ymd < today) {
    if (m[3]) return { ok: false, reason: 'past' };
    ymd = `${year + 1}-${pad2(month)}-${pad2(day)}`;
  }
  return { ok: true, ymd };
}

/** Petit message doux sous le champ date (null si OK / vide). */
export function freeDateHint(res: FreeDateResult): string | null {
  if (res.ok) return null;
  switch (res.reason) {
    case 'past':
      return 'Date passée : choisis aujourd’hui ou plus tard.';
    case 'invalid':
      return 'Date invalide : écris JJ/MM (ex. 12/10).';
    case 'incomplete':
      return 'Format JJ/MM (ex. 12/10).';
    default:
      return null;
  }
}

/** « YYYY-MM-DD » → « JJ/MM/AAAA ». */
export function ymdToFr(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

/** Libellé court « mer. 12 oct. » pour confirmer la date comprise. */
export function formatYmdShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export type FreeIntResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'invalid' | 'low' | 'high' };

/** Entier libre borné (minutes, €, %). Virgule / point acceptés puis arrondis refusés. */
export function parseFreeInt(raw: string, min: number, max: number): FreeIntResult {
  const s = String(raw ?? '').trim().replace(/\s/g, '');
  if (!s) return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(s)) return { ok: false, reason: 'invalid' };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, reason: 'invalid' };
  if (n < min) return { ok: false, reason: 'low' };
  if (n > max) return { ok: false, reason: 'high' };
  return { ok: true, value: n };
}

export function freeIntHint(
  res: FreeIntResult,
  min: number,
  max: number,
  unit: string,
): string | null {
  if (res.ok || res.reason === 'empty') return null;
  if (res.reason === 'invalid') return `Nombre entier seulement (${unit}).`;
  return `Entre ${min} et ${max} ${unit}.`;
}
