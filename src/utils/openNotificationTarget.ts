import { Alert } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import type { Outing, Request } from '../data/types';
import type { RootStackParamList } from '../navigation/types';
import type { PriorityNotifType } from './notifications';
import { navigationRef } from '../navigation/navigationRef';

export type NotificationNavPayload = {
  type?: PriorityNotifType | string;
  outingId?: string;
  requestId?: string;
};

export type NotificationNavContext = {
  getOutingById: (id: string) => Outing | undefined;
  getRequestById: (id: string) => Request | undefined;
  getPendingImprevuForMe: (outingId: string) => { id: string } | undefined;
  canLeaveReview: (
    outingId: string,
    toUserId: string,
  ) => { ok: true } | { ok: false; reason: string };
  getOutingsToRate: () => {
    outing: Outing;
    toUserId: string;
    toUserName: string;
    requestId?: string;
  }[];
};

type Nav = NavigationContainerRef<RootStackParamList>;

function goRequests(nav: Nav) {
  nav.navigate('MainTabs', { screen: 'Requests' });
}

function goProfileRate(nav: Nav) {
  nav.navigate('MainTabs', { screen: 'Profile', params: { focusSection: 'rate' } });
}

function goProfilePhotos(nav: Nav) {
  nav.navigate('MainTabs', {
    screen: 'Profile',
    params: { focusSection: 'photos' },
  });
}

function goOuting(nav: Nav, outingId: string) {
  nav.navigate('OutingDetail', { outingId });
}

/**
 * Central deep-link from local notification tap or clickable toast.
 * Revalidates request/outing state; Alert when target is stale.
 */
export function openNotificationTarget(
  payload: NotificationNavPayload,
  ctx: NotificationNavContext,
  nav: Nav = navigationRef,
): void {
  if (!nav.isReady()) return;

  const type = payload.type;
  const requestId = payload.requestId;
  const outingId = payload.outingId;
  const req = requestId ? ctx.getRequestById(requestId) : undefined;
  const outingFromReq = req ? ctx.getOutingById(req.outingId) : undefined;
  const outing = outingId
    ? ctx.getOutingById(outingId)
    : outingFromReq;

  switch (type) {
    case 'new_request':
      goRequests(nav);
      return;

    case 'accepted':
    case 'confirm_reminder': {
      if (req?.status === 'accepted') {
        nav.navigate('ConfirmSlot', { requestId: req.id });
        return;
      }
      if (
        req &&
        (req.status === 'expired' ||
          req.status === 'cancelled' ||
          req.status === 'declined')
      ) {
        Alert.alert(
          'Demande plus disponible',
          req.status === 'expired'
            ? 'Le délai de confirmation de 10 min est dépassé.'
            : 'Cette demande n’est plus active.',
        );
        goRequests(nav);
        return;
      }
      if (req?.status === 'confirmed') {
        if (outing) goOuting(nav, outing.id);
        else goRequests(nav);
        return;
      }
      goRequests(nav);
      return;
    }

    case 'confirmed': {
      if (outing?.status === 'cancelled') {
        Alert.alert('Sortie annulée', 'Cette sortie a été annulée.');
        goOuting(nav, outing.id);
        return;
      }
      if (outing) {
        goOuting(nav, outing.id);
        return;
      }
      goRequests(nav);
      return;
    }

    case 'chat_unlock':
    case 'message': {
      const oid = outing?.id ?? outingId;
      if (!oid) {
        goRequests(nav);
        return;
      }
      if (outing?.status === 'cancelled') {
        Alert.alert('Sortie annulée', 'Le chat n’est plus disponible.');
        goOuting(nav, oid);
        return;
      }
      nav.navigate('ChatPlaceholder', {
        outingId: oid,
        requestId: requestId ?? req?.id,
      });
      return;
    }

    case 'late':
    case 'new_venue': {
      const oid = outing?.id ?? outingId;
      if (!oid) {
        goRequests(nav);
        return;
      }
      if (outing?.status === 'cancelled') {
        Alert.alert('Sortie annulée', 'Cette sortie a été annulée.');
      }
      goOuting(nav, oid);
      return;
    }

    case 'imprevu': {
      const oid = outing?.id ?? outingId;
      if (!oid) {
        goRequests(nav);
        return;
      }
      if (outing?.status === 'cancelled') {
        Alert.alert('Sortie annulée', 'Cette sortie a été annulée.');
        goOuting(nav, oid);
        return;
      }
      const pending = ctx.getPendingImprevuForMe(oid);
      if (pending) {
        nav.navigate('Imprevu', { outingId: oid, requestId: requestId ?? req?.id });
        return;
      }
      goOuting(nav, oid);
      return;
    }

    case 'cancellation': {
      const oid = outing?.id ?? outingId;
      if (!oid) {
        goRequests(nav);
        return;
      }
      if (outing?.status === 'cancelled') {
        Alert.alert('Sortie annulée', 'Cette sortie a été annulée.');
      }
      goOuting(nav, oid);
      return;
    }

    case 'rate_after': {
      const oid = outing?.id ?? outingId;
      const toRate = ctx.getOutingsToRate();
      const match = oid
        ? toRate.find((i) => i.outing.id === oid)
        : toRate[0];
      if (match) {
        const gate = ctx.canLeaveReview(match.outing.id, match.toUserId);
        if (gate.ok) {
          nav.navigate('LeaveReview', {
            outingId: match.outing.id,
            toUserId: match.toUserId,
            toUserName: match.toUserName,
          });
          return;
        }
      }
      if (oid && outing?.status === 'cancelled') {
        Alert.alert(
          'Sortie annulée',
          'Impossible de noter une sortie annulée.',
        );
      } else if (oid && (!match || toRate.length === 0)) {
        Alert.alert(
          'Notation indisponible',
          'Tu pourras noter seulement si tu étais présent·e. Voici tes sorties à noter.',
        );
      }
      goProfileRate(nav);
      return;
    }

    case 'moment_photo': {
      // Photos de moments passés : uniquement dans le Profil (jamais le fil).
      goProfilePhotos(nav);
      return;
    }

    default: {
      // Fallback: prefer ConfirmSlot / OutingDetail / Requests when ids present
      if (req?.status === 'accepted') {
        nav.navigate('ConfirmSlot', { requestId: req.id });
        return;
      }
      if (outing) {
        goOuting(nav, outing.id);
        return;
      }
      goRequests(nav);
    }
  }
}

/** Parse expo-notifications response content.data into a payload. */
export function payloadFromNotificationData(
  data: Record<string, unknown> | undefined | null,
): NotificationNavPayload {
  if (!data || typeof data !== 'object') return {};
  const str = (k: string) => {
    const v = data[k];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  };
  return {
    type: str('type'),
    outingId: str('outingId'),
    requestId: str('requestId'),
  };
}
