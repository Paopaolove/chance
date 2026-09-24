import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getChatOpensAt } from './chat';

/** Show alerts while app is foregrounded (demo-friendly). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PriorityNotifType =
  | 'new_request'
  | 'accepted'
  | 'confirm_reminder'
  | 'confirmed'
  | 'chat_unlock'
  | 'late'
  | 'cancellation'
  | 'new_venue'
  | 'rate_after';

export type ScheduledNotifIds = {
  accepted?: string;
  reminder3min?: string;
  chatUnlock?: string;
};

export type PushResult = { pushOk: true; id: string } | { pushOk: false };

let handlerConfigured = true;

export async function ensureNotificationPermissions(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }
    const asked = await Notifications.requestPermissionsAsync();
    return (
      asked.granted ||
      asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

async function scheduleAt(
  title: string,
  body: string,
  when: Date,
  data?: Record<string, string>,
): Promise<string | null> {
  const triggerDate =
    when.getTime() <= Date.now() + 1500 ? new Date(Date.now() + 2000) : when;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: data ?? {},
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
    return id;
  } catch {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true, data: data ?? {} },
        trigger: null,
      });
      return id;
    } catch {
      return null;
    }
  }
}

async function scheduleInSeconds(
  title: string,
  body: string,
  seconds: number,
  data?: Record<string, string>,
): Promise<string | null> {
  const sec = Math.max(1, Math.floor(seconds));
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: data ?? {},
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: sec,
        repeats: false,
      },
    });
    return id;
  } catch {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true, data: data ?? {} },
        trigger: null,
      });
      return id;
    } catch {
      return null;
    }
  }
}

/**
 * Try a local/push notification. Returns pushOk=false when permissions or
 * Expo Go / web scheduling fails — caller should fall back to in-app toast + Alert.
 */
export async function sendPriorityPush(input: {
  type: PriorityNotifType;
  title: string;
  body: string;
  delaySeconds?: number;
  data?: Record<string, string>;
}): Promise<PushResult> {
  const granted = await ensureNotificationPermissions();
  if (!granted) return { pushOk: false };
  const data = { type: input.type, ...(input.data ?? {}) };
  const delay = input.delaySeconds ?? 0;
  const id =
    delay <= 0
      ? await scheduleInSeconds(input.title, input.body, 1, data)
      : await scheduleInSeconds(input.title, input.body, delay, data);
  if (!id) return { pushOk: false };
  return { pushOk: true, id };
}

/**
 * After host accepts: notify guest immediately (10 min confirm window)
 * + reminder at ~3 min left (7 min after accept).
 */
export async function scheduleAcceptedConfirmNotifications(input: {
  outingTitle: string;
  hostName: string;
  confirmDeadlineAt: string;
  requestId: string;
}): Promise<ScheduledNotifIds & { pushOk: boolean }> {
  const ids: ScheduledNotifIds = {};
  const granted = await ensureNotificationPermissions();
  if (!granted) return { ...ids, pushOk: false };

  const accepted = await sendPriorityPush({
    type: 'accepted',
    title: 'Tu es accepté·e !',
    body: `${input.hostName} t’a accepté·e pour « ${input.outingTitle} ». Confirme ta place dans 10 min.`,
    delaySeconds: 1,
    data: { requestId: input.requestId },
  });
  if (accepted.pushOk) ids.accepted = accepted.id;

  const deadlineMs = new Date(input.confirmDeadlineAt).getTime();
  const reminderAt = new Date(deadlineMs - 3 * 60 * 1000);
  const secondsUntilReminder = (reminderAt.getTime() - Date.now()) / 1000;
  if (secondsUntilReminder > 2) {
    const reminder = await sendPriorityPush({
      type: 'confirm_reminder',
      title: 'Plus que 3 min',
      body: `Confirme ta place pour « ${input.outingTitle} » avant la fin du délai.`,
      delaySeconds: secondsUntilReminder,
      data: { requestId: input.requestId },
    });
    if (reminder.pushOk) ids.reminder3min = reminder.id;
  }
  return { ...ids, pushOk: !!ids.accepted };
}

/** Chat unlocks H−1 — schedule at getChatOpensAt(startsAt). */
export async function scheduleChatUnlockNotification(input: {
  outingTitle: string;
  startsAt: string;
  outingId: string;
}): Promise<string | null> {
  const granted = await ensureNotificationPermissions();
  if (!granted) return null;
  const opensAt = getChatOpensAt(input.startsAt);
  const seconds = (opensAt.getTime() - Date.now()) / 1000;
  if (seconds > 2) {
    const r = await sendPriorityPush({
      type: 'chat_unlock',
      title: 'Chat ouvert',
      body: `Le chat pour « ${input.outingTitle} » est déverrouillé (H−1).`,
      delaySeconds: seconds,
      data: { outingId: input.outingId },
    });
    return r.pushOk ? r.id : null;
  }
  return scheduleAt(
    'Chat ouvert',
    `Le chat pour « ${input.outingTitle} » est déverrouillé (H−1).`,
    opensAt,
    { type: 'chat_unlock', outingId: input.outingId },
  );
}

/** Demo QA: fire all priority notification types quickly. */
export async function simulateDemoNotifications(input?: {
  outingTitle?: string;
}): Promise<{ ok: true; pushOk: boolean } | { ok: false; reason: string }> {
  const title = input?.outingTitle ?? 'ta sortie';
  const granted = await ensureNotificationPermissions();
  if (!granted) return { ok: false, reason: 'permission_denied' };

  const steps: {
    type: PriorityNotifType;
    title: string;
    body: string;
    delay: number;
  }[] = [
    {
      type: 'new_request',
      title: 'Nouvelle demande',
      body: `Démo · Juliette veut rejoindre « ${title} ».`,
      delay: 1,
    },
    {
      type: 'accepted',
      title: 'Tu es accepté·e !',
      body: `Démo · confirme ta place dans 10 min pour « ${title} ».`,
      delay: 3,
    },
    {
      type: 'confirm_reminder',
      title: 'Plus que 3 min',
      body: `Démo · rappel confirmation pour « ${title} ».`,
      delay: 5,
    },
    {
      type: 'confirmed',
      title: 'Place confirmée',
      body: `Démo · « ${title} » est confirmée.`,
      delay: 7,
    },
    {
      type: 'chat_unlock',
      title: 'Chat ouvert',
      body: `Démo · le chat pour « ${title} » est déverrouillé (H−1).`,
      delay: 9,
    },
    {
      type: 'late',
      title: 'Retard',
      body: `Démo · l’autre personne a un retard (10 min).`,
      delay: 11,
    },
    {
      type: 'cancellation',
      title: 'Annulation',
      body: `Démo · « ${title} » a été annulée.`,
      delay: 13,
    },
    {
      type: 'new_venue',
      title: 'Nouveau lieu',
      body: `Démo · un lieu alternatif est proposé pour « ${title} ».`,
      delay: 15,
    },
    {
      type: 'rate_after',
      title: 'Noter la sortie',
      body: `Démo · comment s’est passée « ${title} » ?`,
      delay: 17,
    },
  ];

  let anyOk = false;
  for (const s of steps) {
    const r = await sendPriorityPush({
      type: s.type,
      title: s.title,
      body: s.body,
      delaySeconds: s.delay,
      data: { demo: '1' },
    });
    if (r.pushOk) anyOk = true;
  }
  return { ok: true, pushOk: anyOk };
}

export async function cancelAllChanceNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}

/** Android channel (no-op on iOS). */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('chance-default', {
      name: 'Chance',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // ignore
  }
}

void handlerConfigured;
