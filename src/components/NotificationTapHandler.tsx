import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { useChance } from '../data/ChanceContext';
import {
  flushPendingNotificationTarget,
  openNotificationTarget,
  payloadFromNotificationData,
} from '../utils/openNotificationTarget';

/**
 * Listens for local notification taps and routes via openNotificationTarget.
 * Mount inside NavigationContainer (RootNavigator).
 * Cold-start: queue until navigation is ready; clear the OS last-response
 * only after the target is actually handled.
 */
export function NotificationTapHandler() {
  const {
    getOutingById,
    getRequestById,
    getPendingImprevuForMe,
    canLeaveReview,
    getOutingsToRate,
  } = useChance();
  const ctxRef = useRef({
    getOutingById,
    getRequestById,
    getPendingImprevuForMe,
    canLeaveReview,
    getOutingsToRate,
  });
  ctxRef.current = {
    getOutingById,
    getRequestById,
    getPendingImprevuForMe,
    canLeaveReview,
    getOutingsToRate,
  };

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        openNotificationTarget(
          payloadFromNotificationData(data),
          ctxRef.current,
        );
      },
    );

    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (!last) return;
      const data = last.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const payload = payloadFromNotificationData(data);
      if (!payload.type && !payload.outingId && !payload.requestId) return;

      const clearIfHandled = (handled: boolean) => {
        if (handled) {
          void Notifications.clearLastNotificationResponseAsync();
        }
        return handled;
      };

      if (clearIfHandled(openNotificationTarget(payload, ctxRef.current))) {
        return;
      }
      // Not ready yet (or onReady already ran before we queued): retry briefly.
      let attempts = 0;
      const id = setInterval(() => {
        attempts += 1;
        const handled =
          flushPendingNotificationTarget() ||
          openNotificationTarget(payload, ctxRef.current);
        if (clearIfHandled(handled) || attempts >= 50) {
          clearInterval(id);
        }
      }, 100);
    });

    return () => sub.remove();
  }, []);

  return null;
}
