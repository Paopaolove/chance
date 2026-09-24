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

export type ScheduledNotifIds = {
  accepted?: string;
  reminder3min?: string;
  chatUnlock?: string;
};

let handlerConfigured = true;

export async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const asked = await Notifications.requestPermissionsAsync();
  return (
    asked.granted ||
    asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function scheduleAt(
  title: string,
  body: string,
  when: Date,
  data?: Record<string, string>,
): Promise<string | null> {
  const triggerDate = when.getTime() <= Date.now() + 1500
    ? new Date(Date.now() + 2000)
    : when;
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
    // Web / Expo Go limitations — fall back to immediate
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
 * After host accepts: notify guest immediately (10 min confirm window)
 * + reminder at ~3 min left (7 min after accept).
 */
export async function scheduleAcceptedConfirmNotifications(input: {
  outingTitle: string;
  hostName: string;
  confirmDeadlineAt: string;
  requestId: string;
}): Promise<ScheduledNotifIds> {
  const ids: ScheduledNotifIds = {};
  const granted = await ensureNotificationPermissions();
  if (!granted) return ids;

  ids.accepted =
    (await scheduleInSeconds(
      'Tu es accepté·e !',
      `${input.hostName} t’a accepté·e pour « ${input.outingTitle} ». Confirme ta place dans 10 min.`,
      1,
      { type: 'accepted', requestId: input.requestId },
    )) ?? undefined;

  const deadlineMs = new Date(input.confirmDeadlineAt).getTime();
  const reminderAt = new Date(deadlineMs - 3 * 60 * 1000);
  const secondsUntilReminder = (reminderAt.getTime() - Date.now()) / 1000;
  if (secondsUntilReminder > 2) {
    ids.reminder3min =
      (await scheduleInSeconds(
        'Plus que 3 min',
        `Confirme ta place pour « ${input.outingTitle} » avant la fin du délai.`,
        secondsUntilReminder,
        { type: 'confirm_reminder', requestId: input.requestId },
      )) ?? undefined;
  }
  return ids;
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
  return scheduleAt(
    'Chat ouvert',
    `Le chat pour « ${input.outingTitle} » est déverrouillé (H−1).`,
    opensAt,
    { type: 'chat_unlock', outingId: input.outingId },
  );
}

/** Demo QA: fire the 3 notification types quickly (1s / 4s / 7s). */
export async function simulateDemoNotifications(input?: {
  outingTitle?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const title = input?.outingTitle ?? 'ta sortie';
  const granted = await ensureNotificationPermissions();
  if (!granted) return { ok: false, reason: 'permission_denied' };

  await scheduleInSeconds(
    'Tu es accepté·e !',
    `Démo · confirme ta place dans 10 min pour « ${title} ».`,
    1,
    { type: 'accepted', demo: '1' },
  );
  await scheduleInSeconds(
    'Plus que 3 min',
    `Démo · rappel confirmation pour « ${title} ».`,
    4,
    { type: 'confirm_reminder', demo: '1' },
  );
  await scheduleInSeconds(
    'Chat ouvert',
    `Démo · le chat pour « ${title} » est déverrouillé (H−1).`,
    7,
    { type: 'chat_unlock', demo: '1' },
  );
  return { ok: true };
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
