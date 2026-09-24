import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import {
  clampLateMinutes,
  formatUntilChatOpens,
  getChatOpensAt,
  isChatUnlocked,
  LATE_MAX_MINUTES,
  LATE_MIN_MINUTES,
  LATE_PRESET_OR_MORE,
  LATE_PRESETS,
  lateChipLabel,
  lateLabel,
} from '../utils/chat';
import { formatOutingWhen } from '../utils/format';

type R = RouteProp<RootStackParamList, 'ChatPlaceholder'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ChatPlaceholderScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const {
    getOutingById,
    getRequestById,
    state,
    getChatMessages,
    ensureChatSeeded,
    sendChatMessage,
    reportLate,
    getLateReportsForOthers,
    getMyImprevu,
  } = useChance();

  const outing = getOutingById(route.params.outingId);
  const request = route.params.requestId
    ? getRequestById(route.params.requestId)
    : undefined;

  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState('');
  const [lateOpen, setLateOpen] = useState(false);
  const [lateCustom, setLateCustom] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const unlocked = outing ? isChatUnlocked(outing.startsAt, now) : false;

  useEffect(() => {
    if (unlocked && outing) {
      ensureChatSeeded(outing.id, request?.id);
    }
  }, [unlocked, outing, request?.id, ensureChatSeeded]);

  const messages = useMemo(() => {
    if (!outing) return [];
    return getChatMessages(outing.id, request?.id);
  }, [outing, request?.id, getChatMessages]);

  const lateFromOthers = useMemo(() => {
    if (!outing) return [];
    return getLateReportsForOthers(outing.id, request?.id);
  }, [outing, request?.id, getLateReportsForOthers]);

  if (!outing) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Sortie introuvable.</Text>
      </View>
    );
  }

  const otherName =
    outing.hostId === state.currentUser?.id
      ? request?.userName ?? 'l’autre personne'
      : outing.hostName;

  const confirmed =
    request?.status === 'confirmed' ||
    (outing.hostId === state.currentUser?.id &&
      state.requests.some(
        (r) =>
          r.outingId === outing.id &&
          r.status === 'confirmed' &&
          (!request || r.id === request.id),
      ));

  const opensAt = getChatOpensAt(outing.startsAt);

  if (!unlocked) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Chat verrouillé</Text>
        <Text style={styles.sub}>
          avec {otherName} · {outing.title}
        </Text>

        <View style={styles.lockCard}>
          <Text style={styles.lockEmoji}>🔒</Text>
          <Text style={styles.lockTitle}>
            {formatUntilChatOpens(outing.startsAt, now)}
          </Text>
          <Text style={styles.lockBody}>
            Le chat s’ouvre 1 h avant la sortie (
            {opensAt.toLocaleString('fr-FR', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
            ).
          </Text>
          <Text style={styles.lockHint}>
            Sortie : {formatOutingWhen(outing.startsAt)}
          </Text>
        </View>

        <View style={styles.info}>
          <Text style={styles.infoLabel}>Lieu</Text>
          <Text style={styles.infoValue}>
            {confirmed
              ? outing.exactAddress
              : `${outing.venueName} · ${outing.approxArea}`}
          </Text>
          {!confirmed ? (
            <Text style={styles.lockHint}>
              L’adresse exacte reste masquée jusqu’à confirmation.
            </Text>
          ) : null}
        </View>

        {confirmed ? (
          getMyImprevu(outing.id) ? (
            <Text style={[styles.lockHint, { marginTop: spacing.lg }]}>
              Imprévu déjà signalé — pas de chat libre pour en discuter.
            </Text>
          ) : (
            <Button
              title="Imprévu"
              variant="ghost"
              onPress={() =>
                navigation.navigate('Imprevu', {
                  outingId: outing.id,
                  requestId: request?.id,
                })
              }
              style={{ marginTop: spacing.lg }}
            />
          )
        ) : null}


      </View>
    );
  }

  if (!confirmed) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Chat indisponible</Text>
        <Text style={styles.sub}>
          avec {otherName} · {outing.title}
        </Text>
        <View style={styles.lockCard}>
          <Text style={styles.lockEmoji}>🔒</Text>
          <Text style={styles.lockTitle}>Confirmation requise</Text>
          <Text style={styles.lockBody}>
            Le chat et l’adresse exacte n’apparaissent qu’après confirmation de
            place (et le chat s’ouvre à H−1).
          </Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.infoLabel}>Lieu</Text>
          <Text style={styles.infoValue}>
            {outing.venueName} · {outing.approxArea}
          </Text>
          <Text style={styles.lockHint}>
            L’adresse exacte reste masquée jusqu’à confirmation.
          </Text>
        </View>
      </View>
    );
  }

  const onSend = () => {
    sendChatMessage(outing.id, draft, request?.id);
    setDraft('');
  };

  const onLate = (minutes: number, orMore = false) => {
    const n = clampLateMinutes(minutes);
    if (n == null) {
      Alert.alert(
        'Minutes invalides',
        `Indique un nombre entre ${LATE_MIN_MINUTES} et ${LATE_MAX_MINUTES}.`,
      );
      return;
    }
    reportLate(outing.id, n, request?.id, { orMore });
    setLateOpen(false);
    setLateCustom('');
    Alert.alert(
      'Retard signalé',
      `L’autre personne verra un bandeau « ${lateLabel(n, { orMore })} ».`,
    );
  };

  const onLateCustom = () => {
    const parsed = Number.parseInt(lateCustom.trim(), 10);
    onLate(parsed, false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <View style={styles.wrapTight}>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.sub}>
          avec {otherName} · {outing.title}
        </Text>
        <Text style={styles.openBadge}>Ouvert · H−1</Text>

        {lateFromOthers.length ? (
          <View style={styles.lateBanner}>
            {lateFromOthers.map((r) => (
              <Text key={r.id} style={styles.lateBannerText}>
                ⏱ {r.reporterName} a un retard ({lateLabel(r.minutes, {
                  orMore: r.orMore,
                })})
              </Text>
            ))}
          </View>
        ) : null}

        <ScrollView
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m) => {
            if (m.kind === 'system') {
              return (
                <View key={m.id} style={styles.bubbleSystem}>
                  <Text style={styles.systemText}>{m.text}</Text>
                </View>
              );
            }
            const mine = m.senderId === state.currentUser?.id;
            return (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMe : styles.bubbleThem,
                ]}
              >
                {!mine && m.senderName ? (
                  <Text style={styles.senderName}>{m.senderName}</Text>
                ) : null}
                <Text
                  style={[styles.bubbleText, mine && styles.bubbleTextMe]}
                >
                  {m.text}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {lateOpen ? (
          <View style={styles.latePanel}>
            <Text style={styles.lateTitle}>J’ai un retard</Text>
            <Text style={styles.lateHint}>
              Choisis une durée ou écris le nombre exact de minutes — un
              message système est envoyé à l’autre personne.
            </Text>
            <View style={styles.lateRow}>
              {LATE_PRESETS.map((m) => (
                <Pressable
                  key={m}
                  style={styles.lateChip}
                  onPress={() =>
                    onLate(m, m === LATE_PRESET_OR_MORE)
                  }
                >
                  <Text style={styles.lateChipText}>{lateChipLabel(m)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.lateCustomRow}>
              <TextInput
                style={styles.lateCustomInput}
                value={lateCustom}
                onChangeText={setLateCustom}
                placeholder="Minutes exactes"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={onLateCustom}
                maxLength={3}
              />
              <Pressable
                style={[
                  styles.lateCustomBtn,
                  !lateCustom.trim() && styles.sendDisabled,
                ]}
                disabled={!lateCustom.trim()}
                onPress={onLateCustom}
              >
                <Text style={styles.lateCustomBtnText}>Envoyer</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                setLateOpen(false);
                setLateCustom('');
              }}
            >
              <Text style={styles.lateCancel}>Annuler</Text>
            </Pressable>
          </View>
        ) : (
          <Button
            title="J’ai un retard"
            variant="secondary"
            onPress={() => setLateOpen(true)}
            style={{ marginBottom: spacing.sm }}
          />
        )}




        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Écrire un message…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={onSend}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.sendBtn, !draft.trim() && styles.sendDisabled]}
            onPress={onSend}
            disabled={!draft.trim()}
          >
            <Text style={styles.sendLabel}>Envoyer</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  wrapTight: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.text },
  sub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  openBadge: {
    ...typography.small,
    color: colors.success,
    fontFamily: fonts.semiBold,
    marginBottom: spacing.md,
  },
  lateBanner: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: 4,
  },
  lateBannerText: {
    ...typography.bodyStrong,
    color: colors.warning,
    fontFamily: fonts.semiBold,
  },
  body: { ...typography.body, color: colors.textSecondary },
  lockCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  lockEmoji: { fontSize: 32, marginBottom: spacing.sm },
  lockTitle: {
    ...typography.subtitle,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  lockBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  lockHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  info: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  infoLabel: { ...typography.caption, color: colors.textMuted },
  infoValue: { ...typography.bodyStrong, color: colors.text, marginTop: 2 },
  thread: { flex: 1 },
  threadContent: { paddingBottom: spacing.md, gap: spacing.sm },
  bubbleSystem: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '92%',
  },
  systemText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleThem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  senderName: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: 2,
  },
  bubbleText: { ...typography.body, color: colors.text },
  bubbleTextMe: { color: colors.white },
  latePanel: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  lateTitle: {
    ...typography.bodyStrong,
    color: colors.text,
    marginBottom: 4,
  },
  lateHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  lateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lateCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  lateCustomInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  lateCustomBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lateCustomBtnText: {
    ...typography.bodyStrong,
    color: colors.white,
    fontFamily: fonts.semiBold,
  },
  lateChip: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lateChipText: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
  lateCancel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sendDisabled: { opacity: 0.45 },
  sendLabel: {
    ...typography.bodyStrong,
    color: colors.white,
    fontFamily: fonts.semiBold,
  },
});
