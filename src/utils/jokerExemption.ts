/**
 * Lot 2 — exemption joker + quota mensuel atomique.
 * Caution rendue via joker = définitive pour cet usage ; cancel / no-show
 * ultérieur ne re-perd pas la caution ni ne compte une absence.
 * Voir docs/deposit-imprevu.md.
 */
import type { ImprevuReport } from '../data/types';

export type JokerReportSlice = Pick<
  ImprevuReport,
  'outingId' | 'reporterId' | 'requestId' | 'jokerUsed'
>;

/** True if this guest already consumed the joker on this outing (or request). */
export function isJokerExempted(
  reports: JokerReportSlice[],
  opts: { outingId: string; reporterId: string; requestId?: string },
): boolean {
  return reports.some(
    (r) =>
      r.jokerUsed === true &&
      r.outingId === opts.outingId &&
      r.reporterId === opts.reporterId &&
      (opts.requestId == null ||
        r.requestId == null ||
        r.requestId === opts.requestId),
  );
}

/**
 * Atomic monthly quota: consume only if monthKey is non-empty and not already
 * the stored key. Reducer must apply this check before writing jokerUsedMonthKey
 * so a double-tap / race cannot double-consume.
 */
export function canConsumeMonthlyJoker(
  jokerUsedMonthKey: string | undefined,
  monthKey: string,
): boolean {
  return Boolean(monthKey) && jokerUsedMonthKey !== monthKey;
}

export type DepositStatusLite = 'none' | 'held' | 'returned' | 'forfeited';

/**
 * Guest cancel on a confirmed seat — deposit outcome.
 * Host path always returns (non-fault). Joker exemption keeps `returned`
 * even outside the free window (and never re-forfeits a joker return).
 */
export function resolveGuestCancelDeposit(opts: {
  by: 'guest' | 'host';
  freeWindow: boolean;
  jokerExempted: boolean;
  currentDeposit?: DepositStatusLite;
}): DepositStatusLite {
  if (opts.by === 'host') {
    return opts.currentDeposit === 'held' || !opts.currentDeposit
      ? 'returned'
      : opts.currentDeposit;
  }
  if (opts.jokerExempted) {
    // Joker already returned the deposit for good — never re-forfeit.
    return 'returned';
  }
  return opts.freeWindow ? 'returned' : 'forfeited';
}

/** No-show after joker: no forfeit, no absence strike. */
export function shouldApplyGuestNoShowPenalty(jokerExempted: boolean): boolean {
  return !jokerExempted;
}

/** Logical self-checks (no test framework). Returns list of failure messages. */
export function runJokerLot2SelfChecks(): string[] {
  const fails: string[] = [];
  const assert = (cond: boolean, msg: string) => {
    if (!cond) fails.push(msg);
  };

  const reports: JokerReportSlice[] = [
    {
      outingId: 'o1',
      reporterId: 'u1',
      requestId: 'r1',
      jokerUsed: true,
    },
    {
      outingId: 'o2',
      reporterId: 'u1',
      requestId: 'r2',
      jokerUsed: false,
    },
  ];

  assert(
    isJokerExempted(reports, { outingId: 'o1', reporterId: 'u1', requestId: 'r1' }),
    'joker exemption should match outing+user+request',
  );
  assert(
    isJokerExempted(reports, { outingId: 'o1', reporterId: 'u1' }),
    'joker exemption should match without requestId',
  );
  assert(
    !isJokerExempted(reports, {
      outingId: 'o2',
      reporterId: 'u1',
      requestId: 'r2',
    }),
    'jokerUsed false must not exempt',
  );
  assert(
    !isJokerExempted(reports, {
      outingId: 'o1',
      reporterId: 'u2',
      requestId: 'r1',
    }),
    'other user must not be exempted',
  );

  assert(canConsumeMonthlyJoker(undefined, '2026-09'), 'first joker of month ok');
  assert(canConsumeMonthlyJoker('2026-08', '2026-09'), 'new month ok');
  assert(!canConsumeMonthlyJoker('2026-09', '2026-09'), 'same month blocked');
  assert(!canConsumeMonthlyJoker(undefined, ''), 'empty monthKey blocked');

  // Simulate atomic double-dispatch: first consumes, second must fail.
  let monthKeyStore: string | undefined;
  const tryConsume = (month: string): boolean => {
    if (!canConsumeMonthlyJoker(monthKeyStore, month)) return false;
    monthKeyStore = month;
    return true;
  };
  assert(tryConsume('2026-09') === true, 'first consume ok');
  assert(tryConsume('2026-09') === false, 'second concurrent consume blocked');

  assert(
    resolveGuestCancelDeposit({
      by: 'guest',
      freeWindow: false,
      jokerExempted: true,
      currentDeposit: 'returned',
    }) === 'returned',
    'late cancel after joker must keep returned',
  );
  assert(
    resolveGuestCancelDeposit({
      by: 'guest',
      freeWindow: false,
      jokerExempted: false,
      currentDeposit: 'held',
    }) === 'forfeited',
    'late cancel without joker still forfeits',
  );
  assert(
    resolveGuestCancelDeposit({
      by: 'guest',
      freeWindow: true,
      jokerExempted: false,
      currentDeposit: 'held',
    }) === 'returned',
    'free window still returns',
  );
  assert(
    resolveGuestCancelDeposit({
      by: 'host',
      freeWindow: false,
      jokerExempted: false,
      currentDeposit: 'held',
    }) === 'returned',
    'host cancel returns deposit',
  );

  assert(
    shouldApplyGuestNoShowPenalty(true) === false,
    'no-show after joker: no penalty',
  );
  assert(
    shouldApplyGuestNoShowPenalty(false) === true,
    'no-show without joker: penalty',
  );

  return fails;
}
