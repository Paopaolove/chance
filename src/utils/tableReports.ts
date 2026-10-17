/**
 * Signalement et revue (DECISIONS 16/10 + GO 17/10) — démo, aucun vrai
 * message, aucun paiement.
 * - Tout membre de la table (hôte ou invité confirmé) peut signaler un autre
 *   membre, pendant ou après le moment (à partir de H).
 * - File côté Moment : Ouvert → Contact signaleur → Contact concerné → Clos,
 *   une étape à la fois ; un signalement clos est figé.
 * - Message au concerné fixe et neutre, sans identité du signaleur.
 * - Compteur hôte : 2 départs malaise à ses tables en 3 mois (même fenêtre
 *   Paris que l’invité) → revue de l’hôte (drapeau confidentiel).
 */
import type { Outing, Request } from '../data/types';
import { isStartsAtReached, parisYmd } from './parisTime';
import {
  DISCOMFORT_REVIEW_THRESHOLD,
  DISCOMFORT_WINDOW_MONTHS,
  parisYmdMonthsAgo,
} from './leaveTable';

export type TableReportStatus =
  | 'open'
  | 'contact_reporter'
  | 'contact_target'
  | 'closed';

export type TableReportOutcome = 'nothing' | 'warning' | 'suspension' | 'abusive';

export const TABLE_REPORT_STATUS_ORDER: TableReportStatus[] = [
  'open',
  'contact_reporter',
  'contact_target',
  'closed',
];

export const TABLE_REPORT_STATUS_LABELS: Record<TableReportStatus, string> = {
  open: 'Ouvert',
  contact_reporter: 'Contact signaleur',
  contact_target: 'Contact concerné',
  closed: 'Clos',
};

/** Message simulé au signaleur (démo). */
export const REPORT_REPORTER_MESSAGE =
  'Merci pour ton signalement. Peux-tu nous en dire un peu plus ?';
/** Message simulé au concerné : fixe, neutre, jamais l’identité du signaleur. */
export const REPORT_TARGET_MESSAGE = 'Est-ce que tout s’est bien passé ?';

export const TABLE_REPORT_NOTE_MAX_CHARS = 280;

export type TableReportMessage = {
  to: 'reporter' | 'target';
  userId: string;
  body: string;
  at: string;
};

export type TableReportLite = {
  id: string;
  outingId: string;
  reporterId: string;
  targetUserId: string;
  note?: string;
  createdAt: string;
  status: TableReportStatus;
  messages: TableReportMessage[];
  outcome?: TableReportOutcome;
  closedAt?: string;
};

/** Membres de la table : l’hôte + les invités confirmés. */
export function tableMemberIds(
  outing: Pick<Outing, 'id' | 'hostId'>,
  requests: Pick<Request, 'outingId' | 'userId' | 'status'>[],
): string[] {
  const ids = new Set<string>([outing.hostId]);
  for (const r of requests) {
    if (r.outingId === outing.id && r.status === 'confirmed') ids.add(r.userId);
  }
  return [...ids];
}

/** Peut ouvrir l’écran « Signaler » (membre, moment non annulé, à partir de H). */
export function canOpenTableReport(
  outing: Pick<Outing, 'id' | 'hostId' | 'startsAt' | 'status'>,
  requests: Pick<Request, 'outingId' | 'userId' | 'status'>[],
  reporterId: string,
  nowMs = Date.now(),
): boolean {
  if (outing.status === 'cancelled') return false;
  if (!tableMemberIds(outing, requests).includes(reporterId)) return false;
  return isStartsAtReached(outing.startsAt, nowMs);
}

export function canSubmitTableReport(
  outing: Pick<Outing, 'id' | 'hostId' | 'startsAt' | 'status'>,
  requests: Pick<Request, 'outingId' | 'userId' | 'status'>[],
  reporterId: string,
  targetUserId: string,
  nowMs = Date.now(),
): boolean {
  if (!reporterId || reporterId === targetUserId) return false;
  if (!canOpenTableReport(outing, requests, reporterId, nowMs)) return false;
  return tableMemberIds(outing, requests).includes(targetUserId);
}

export function normalizeTableReportNote(note: string | undefined): string | undefined {
  const t = (note ?? '').trim().slice(0, TABLE_REPORT_NOTE_MAX_CHARS);
  return t ? t : undefined;
}

/**
 * Transition d’un signalement : seulement l’étape suivante, issue requise
 * (et seulement) à la clôture. Retourne null si invalide (saut, retour,
 * clos figé, issue manquante / hors clôture).
 */
export function advanceTableReport<T extends TableReportLite>(
  report: T,
  to: TableReportStatus,
  at: string,
  outcome?: TableReportOutcome,
): T | null {
  if (report.status === 'closed') return null;
  const i = TABLE_REPORT_STATUS_ORDER.indexOf(report.status);
  if (TABLE_REPORT_STATUS_ORDER[i + 1] !== to) return null;
  if (to === 'closed') {
    if (!outcome) return null;
    return { ...report, status: 'closed', outcome, closedAt: at };
  }
  if (outcome) return null;
  const msg: TableReportMessage =
    to === 'contact_reporter'
      ? { to: 'reporter', userId: report.reporterId, body: REPORT_REPORTER_MESSAGE, at }
      : { to: 'target', userId: report.targetUserId, body: REPORT_TARGET_MESSAGE, at };
  return { ...report, status: to, messages: [...report.messages, msg] };
}

/** Messages qu’un utilisateur reçoit (démo) — jamais d’info sur le signaleur pour le concerné. */
export function tableReportMessagesFor(
  reports: TableReportLite[],
  userId: string,
): { body: string; at: string }[] {
  const out: { body: string; at: string }[] = [];
  for (const r of reports) {
    for (const m of r.messages) {
      if (m.userId === userId) out.push({ body: m.body, at: m.at });
    }
  }
  return out;
}

export type HostDiscomfortReportLite = {
  hostId: string;
  createdAt: string;
};

/** Départs malaise à ses tables sur les 3 derniers mois (calendrier Paris, même fenêtre que l’invité). */
export function countRecentHostDiscomfort(
  reports: HostDiscomfortReportLite[],
  hostId: string,
  nowMs = Date.now(),
): number {
  const from = parisYmdMonthsAgo(nowMs, DISCOMFORT_WINDOW_MONTHS);
  return reports.filter(
    (r) => r.hostId === hostId && parisYmd(r.createdAt) >= from,
  ).length;
}

export function hostNeedsReview(
  reports: HostDiscomfortReportLite[],
  hostId: string,
  nowMs = Date.now(),
): boolean {
  return countRecentHostDiscomfort(reports, hostId, nowMs) >= DISCOMFORT_REVIEW_THRESHOLD;
}
