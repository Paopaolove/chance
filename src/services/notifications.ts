/**
 * Notifications — frontière future (Lot E scaffold).
 *
 * Implémentation démo actuelle : `src/utils/notifications.ts` (expo-notifications)
 * + appels depuis ChanceContext (accept → rappel 10 min, chat H−1, etc.).
 *
 * Ce module fixe le port pour un futur provider (Expo push tokens + backend).
 * Ne remplace pas encore utils/notifications — pas de double envoi.
 */

import type { PriorityNotifType } from '../utils/notifications';

export type NotifyPriorityInput = {
  type: PriorityNotifType;
  title: string;
  body: string;
  delaySeconds?: number;
  data?: Record<string, string>;
};

export interface NotificationsService {
  ensurePermissions(): Promise<boolean>;
  notifyPriority(input: NotifyPriorityInput): Promise<void>;
  /** Rappel confirmation après accept hôte. */
  scheduleAcceptedConfirm(input: {
    outingTitle: string;
    confirmDeadlineIso: string;
  }): Promise<{ pushOk: boolean }>;
  /** Ouverture chat ~H−1. */
  scheduleChatUnlock(input: {
    outingTitle: string;
    opensAtIso: string;
  }): Promise<{ pushOk: boolean }>;
}

/**
 * Stub no-op si aucun backend / si non branché.
 * La démo utilise toujours `src/utils/notifications.ts` via ChanceContext.
 */
export const notificationsStub: NotificationsService = {
  async ensurePermissions() {
    return false;
  },
  async notifyPriority() {
    /* no-op — démo : ChanceContext.notifyPriority */
  },
  async scheduleAcceptedConfirm() {
    return { pushOk: false };
  },
  async scheduleChatUnlock() {
    return { pushOk: false };
  },
};
