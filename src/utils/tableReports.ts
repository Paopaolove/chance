/**
 * Signalement et revue (DECISIONS 16/10 + GO 17/10) — démo, aucun vrai
 * message, aucun paiement.
 * - Tout membre de la table (hôte ou invité confirmé, partis compris, annulés
 *   exclus) peut signaler un autre membre dès que le chat de la table s’ouvre
 *   (même règle que le chat : H−1, ou dès la confirmation pour l’urgent « déjà
 *   sur place » et les annonces partenaires), pendant ou après le moment.
 * - Catégorie obligatoire (une parmi 8), phrase libre facultative. Le départ
 *   malaise n’est pas une catégorie (circuit séparé, inchangé).
 * - Effet de l’abus (3 mois glissants, calendrier Paris) : 1er « abusif » →
 *   avertissement (compteur warnings + trace abusiveReportAt) ; à partir du 2e
 *   dans la fenêtre → chaque nouveau signalement exige une revue manuelle
 *   préalable (requiresManualReviewFirst). Pas de suspension pour ce motif.
 * - File côté Moment : Ouvert → Contact signaleur → Contact concerné → Clos,
 *   une étape à la fois ; un signalement clos est figé.
 * - Issues (registre) : sans suite / avertissement / suspension / signalement
 *   abusif. « Abusif » exige l’un des trois motifs établis (ABUSIVE_REASONS),
 *   sinon refusé (un doute donne « sans suite ») ; enregistré sans aucun effet
 *   sur le signaleur.
 * - Un invité marqué « Pas venu » sur la table ne peut pas signaler.
 * - Notation et signalement sont deux mécaniques séparées : un signalement
 *   est jugé uniquement sur sa catégorie et sa phrase (aucune donnée d’avis,
 *   aucun drapeau lié à un avis ou à un « Pas venu »).
 * - Message au concerné fixe et neutre, sans identité du signaleur.
 * - Compteur hôte : 2 départs malaise à ses tables en 3 mois (même fenêtre
 *   Paris que l’invité) → revue de l’hôte (drapeau confidentiel).
 */
import type { Outing, Request } from '../data/types';
import { isOutingChatOpen } from './chat';
import { parisYmd } from './parisTime';
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

export type TableReportOutcome = 'sans_suite' | 'warning' | 'suspension' | 'abusive';

/**
 * Motifs établis exigés pour l’issue « abusif » (décision Paolo 17/10).
 * « Rien dans le chat » n’est pas un motif.
 */
export const ABUSIVE_REASONS = [
  'reporter_absent',
  'reporter_admitted_false',
  'repeated_unconfirmed',
] as const;
export type AbusiveReason = (typeof ABUSIVE_REASONS)[number];

export const ABUSIVE_REASON_LABELS: Record<AbusiveReason, string> = {
  reporter_absent: 'Le signaleur n’était pas là',
  reporter_admitted_false: 'Le signaleur reconnaît que c’était faux',
  repeated_unconfirmed: 'Plusieurs signalements de sa part, aucun confirmé',
};

/** Catégories (décision Paolo 17/10) : une seule, obligatoire. */
export const TABLE_REPORT_CATEGORIES = [
  'inappropriate_advance',
  'racism',
  'sexism',
  'insults_aggression',
  'threats',
  'not_the_person',
  'solicitation',
  'other',
] as const;
export type TableReportCategory = (typeof TABLE_REPORT_CATEGORIES)[number];

export const TABLE_REPORT_CATEGORY_LABELS: Record<TableReportCategory, string> = {
  inappropriate_advance: 'Proposition ou geste déplacé',
  racism: 'Racisme',
  sexism: 'Sexisme',
  insults_aggression: 'Insultes ou agressivité',
  threats: 'Menaces',
  not_the_person: 'Ce n’était pas la personne',
  solicitation: 'Démarchage',
  other: 'Autre',
};

export function isTableReportCategory(x: unknown): x is TableReportCategory {
  return (TABLE_REPORT_CATEGORIES as readonly unknown[]).includes(x);
}

/** « Plusieurs signalements » (choix minimal) : au moins 2 autres, clos. */
export const REPEATED_UNCONFIRMED_MIN_OTHERS = 2;

/** Libellés des issues, alignés sur le registre (DECISIONS). */
export const TABLE_REPORT_OUTCOME_LABELS: Record<TableReportOutcome, string> = {
  sans_suite: 'Sans suite',
  warning: 'Avertissement',
  suspension: 'Suspension',
  abusive: 'Signalement abusif',
};

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
  category?: TableReportCategory;
  note?: string;
  createdAt: string;
  status: TableReportStatus;
  /** Signaleur avec 2 « abusif » en 3 mois : revue manuelle avant toute étape. */
  requiresManualReviewFirst?: boolean;
  manualReviewClearedAt?: string;
  messages: TableReportMessage[];
  outcome?: TableReportOutcome;
  /** Motif établi, seulement avec l’issue « abusif ». */
  abusiveReason?: AbusiveReason;
  closedAt?: string;
};

export function isAbusiveReason(x: unknown): x is AbusiveReason {
  return (ABUSIVE_REASONS as readonly unknown[]).includes(x);
}

/**
 * Motif « abusif » établi ? 'repeated_unconfirmed' est vérifié dans le modèle :
 * au moins 2 autres signalements du même signaleur, clos, aucun avec l’issue
 * avertissement ou suspension. Les deux autres motifs sont constatés par
 * Moment (déclarés avec la décision). Le drapeau de revue ne compte pas.
 */
export function isAbusiveReasonEstablished(
  report: Pick<TableReportLite, 'id' | 'reporterId'>,
  reason: unknown,
  allReports: Pick<TableReportLite, 'id' | 'reporterId' | 'status' | 'outcome'>[],
): boolean {
  if (!isAbusiveReason(reason)) return false;
  if (reason !== 'repeated_unconfirmed') return true;
  const others = allReports.filter(
    (r) => r.id !== report.id && r.reporterId === report.reporterId,
  );
  const closed = others.filter((r) => r.status === 'closed');
  if (closed.length < REPEATED_UNCONFIRMED_MIN_OTHERS) return false;
  return !others.some(
    (r) => r.outcome === 'warning' || r.outcome === 'suspension',
  );
}

/**
 * Membres de la table : l’hôte + les invités confirmés. Un invité parti
 * (« Je quitte la table ») reste confirmé, donc membre ; un annulé est exclu.
 */
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

type ReportOuting = Pick<
  Outing,
  | 'id'
  | 'hostId'
  | 'status'
  | 'startsAt'
  | 'urgentOnSite'
  | 'isPartnerListing'
  | 'hostNoShowReported'
>;

/**
 * Peut ouvrir l’écran « Signaler » : membre, moment non annulé, la table
 * existe (au moins un invité confirmé) et le chat de la table est ouvert
 * (pas de signalement avant un échange possible — même règle que le chat).
 * Un invité marqué « Pas venu » sur cette table ne peut pas signaler : il
 * n’était pas là (le « Pas venu » de l’hôte est une démarche séparée).
 * De même, un hôte déclaré « Pas venu » ne peut signaler personne sur cette
 * table. Un signalement ouvert avant le « Pas venu » reste en revue normale.
 */
export function canOpenTableReport(
  outing: ReportOuting,
  requests: Pick<Request, 'outingId' | 'userId' | 'status' | 'attendance'>[],
  reporterId: string,
  nowMs = Date.now(),
): boolean {
  if (outing.status === 'cancelled') return false;
  const members = tableMemberIds(outing, requests);
  if (members.length < 2) return false; // personne de confirmé : pas de table
  if (!members.includes(reporterId)) return false;
  if (isMarkedNoShow(outing, requests, reporterId)) return false;
  if (isHostMarkedNoShow(outing, reporterId)) return false;
  return isOutingChatOpen(outing, nowMs);
}

/** Hôte de cette table déclaré « Pas venu » (hostNoShowReported). */
export function isHostMarkedNoShow(
  outing: Pick<Outing, 'hostId' | 'hostNoShowReported'>,
  userId: string,
): boolean {
  return outing.hostNoShowReported === true && outing.hostId === userId;
}

/** Invité marqué « Pas venu » (attendance 'absent') sur cette table. */
export function isMarkedNoShow(
  outing: Pick<Outing, 'id'>,
  requests: Pick<Request, 'outingId' | 'userId' | 'status' | 'attendance'>[],
  userId: string,
): boolean {
  return requests.some(
    (r) =>
      r.outingId === outing.id &&
      r.userId === userId &&
      r.status === 'confirmed' &&
      r.attendance === 'absent',
  );
}

export function canSubmitTableReport(
  outing: ReportOuting,
  requests: Pick<Request, 'outingId' | 'userId' | 'status' | 'attendance'>[],
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
  abuse?: {
    reason?: unknown;
    allReports: Pick<TableReportLite, 'id' | 'reporterId' | 'status' | 'outcome'>[];
  },
): T | null {
  if (report.status === 'closed') return null;
  // Revue manuelle préalable non levée : rien au-delà de « Ouvert ».
  if (report.requiresManualReviewFirst) return null;
  const i = TABLE_REPORT_STATUS_ORDER.indexOf(report.status);
  if (TABLE_REPORT_STATUS_ORDER[i + 1] !== to) return null;
  const reason = abuse?.reason;
  if (to === 'closed') {
    if (!outcome) return null;
    if (outcome === 'abusive') {
      // Sans motif établi : refusé (un doute donne « sans suite »).
      if (!isAbusiveReasonEstablished(report, reason, abuse?.allReports ?? [])) {
        return null;
      }
      return {
        ...report,
        status: 'closed',
        outcome,
        abusiveReason: reason as AbusiveReason,
        closedAt: at,
      };
    }
    if (reason !== undefined) return null; // motif seulement avec « abusif »
    return { ...report, status: 'closed', outcome, closedAt: at };
  }
  if (outcome || reason !== undefined) return null;
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

/** « Abusif » établis contre ce signaleur sur 3 mois glissants (calendrier Paris). */
export function countRecentAbusive(
  abusiveReportAt: string[] | undefined,
  nowMs = Date.now(),
): number {
  const from = parisYmdMonthsAgo(nowMs, DISCOMFORT_WINDOW_MONTHS);
  return (abusiveReportAt ?? []).filter((d) => parisYmd(d) >= from).length;
}

/** Seuil : à partir du 2e « abusif » dans la fenêtre → revue manuelle préalable. */
export const ABUSIVE_MANUAL_REVIEW_THRESHOLD = 2;

export function reporterNeedsManualReviewFirst(
  abusiveReportAt: string[] | undefined,
  nowMs = Date.now(),
): boolean {
  return countRecentAbusive(abusiveReportAt, nowMs) >= ABUSIVE_MANUAL_REVIEW_THRESHOLD;
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
