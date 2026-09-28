import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { useChance } from '../data/ChanceContext';
import {
  openNotificationTarget,
  payloadFromNotificationData,
} from '../utils/openNotificationTarget';

/**
 * Listens for local notification taps and routes via openNotificationTarget.
 * Mount inside NavigationContainer (RootNavigator).
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

    // Cold start: user opened app by tapping a notification
    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (!last) return;
      const data = last.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const payload = payloadFromNotificationData(data);
      if (!payload.type && !payload.outingId && !payload.requestId) return;
      // Slight delay so NavigationContainer is ready
      setTimeout(() => {
        openNotificationTarget(payload, ctxRef.current);
        void Notifications.clearLastNotificationResponseAsync();
      }, 400);
    });

    return () => sub.remove();
  }, []);

  return null;
}
