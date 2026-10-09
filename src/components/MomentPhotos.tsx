import React from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { MomentPhoto, Outing } from '../data/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { formatOutingWhen } from '../utils/format';
import {
  MOMENT_PHOTOS_MAX_PER_PERSON,
  MOMENT_PHOTO_PLACEHOLDER_PREFIX,
  MOMENT_PHOTO_STATUS_LABELS,
  type MomentPhotoStatus,
} from '../utils/momentPhotos';
import { Button } from './Button';

/**
 * Photos de moments passés — PROFIL SEULEMENT.
 * Jamais dans le fil, les cartes, la fiche d’un moment à venir, Demandes,
 * ni comme avatar. Pas de like, pas de commentaire, pas de compteur.
 */

const TILE_W = 132;
const TILE_H = 99; // 4:3

/** Tuile photo. `placeholder:` = table dessinée localement (démo, sans réseau). */
export function MomentPhotoTile({
  uri,
  width = TILE_W,
}: {
  uri: string;
  width?: number;
}) {
  const height = Math.round((width * 3) / 4);
  if (uri.startsWith(MOMENT_PHOTO_PLACEHOLDER_PREFIX)) {
    const table = Math.round(height * 0.52);
    const plate = Math.max(10, Math.round(table * 0.26));
    return (
      <View
        style={[styles.tile, styles.placeholder, { width, height }]}
        accessibilityLabel="Photo du moment : la table"
      >
        <View
          style={[
            styles.table,
            { width: table * 1.6, height: table, borderRadius: table / 2 },
          ]}
        >
          <View style={styles.platesRow}>
            <View style={[styles.plate, { width: plate, height: plate, borderRadius: plate / 2 }]} />
            <View style={[styles.glass, { width: plate * 0.45, height: plate * 0.8 }]} />
            <View style={[styles.plate, { width: plate, height: plate, borderRadius: plate / 2 }]} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.tile, { width, height }]}
      accessibilityLabel="Photo du moment"
    />
  );
}

function momentMeta(outing: Outing): string {
  return [formatOutingWhen(outing.startsAt), outing.venueName || outing.neighborhood]
    .filter(Boolean)
    .join(' · ');
}

/** Moment passé sur le profil d’une autre personne : titre, date, lieu, 1–2 photos. */
export function PublicPastMoment({
  outing,
  photos,
}: {
  outing: Outing;
  photos: MomentPhoto[];
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.momentTitle}>{outing.title}</Text>
      <Text style={styles.meta}>{momentMeta(outing)}</Text>
      <View style={styles.photosRow}>
        {photos.map((p) => (
          <MomentPhotoTile key={p.id} uri={p.uri} />
        ))}
      </View>
    </View>
  );
}

type OwnPhoto = { photo: MomentPhoto; status: MomentPhotoStatus; mine: boolean };

/**
 * Mon moment passé (Profil) : photos publiées + les miennes avec leur statut,
 * ajout (après la rencontre seulement), suppression, retrait d’accord.
 */
export function OwnPastMoment({
  outing,
  photos,
  myPhotoCount,
  canAdd,
  onAdd,
  onDelete,
  onWithdraw,
}: {
  outing: Outing;
  photos: OwnPhoto[];
  myPhotoCount: number;
  canAdd: boolean;
  onAdd: () => void;
  onDelete: (photoId: string) => void;
  onWithdraw: (photoId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.momentTitle}>{outing.title}</Text>
      <Text style={styles.meta}>{momentMeta(outing)}</Text>
      {photos.length ? (
        <View style={styles.photosRow}>
          {photos.map(({ photo, status, mine }) => (
            <View key={photo.id} style={styles.photoCell}>
              <MomentPhotoTile uri={photo.uri} />
              {status !== 'published' ? (
                <Text
                  style={[
                    styles.status,
                    status === 'pending' && styles.statusPending,
                  ]}
                >
                  {MOMENT_PHOTO_STATUS_LABELS[status]}
                </Text>
              ) : null}
              {mine ? (
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  onPress={() =>
                    Alert.alert(
                      'Supprimer la photo ?',
                      'Elle disparaît de vos profils.',
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Supprimer',
                          style: 'destructive',
                          onPress: () => onDelete(photo.id),
                        },
                      ],
                    )
                  }
                >
                  <Text style={styles.link}>Supprimer</Text>
                </Pressable>
              ) : (
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  onPress={() =>
                    Alert.alert(
                      'Retirer ton accord ?',
                      `La photo de ${photo.uploaderName} redevient privée.`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Retirer',
                          style: 'destructive',
                          onPress: () => onWithdraw(photo.id),
                        },
                      ],
                    )
                  }
                >
                  <Text style={styles.link}>Retirer mon accord</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}
      {canAdd ? (
        <View style={styles.addBlock}>
          <Button
            title="Ajouter une photo du moment"
            variant="secondary"
            onPress={onAdd}
          />
          <Text style={styles.hint}>
            Le lieu, la table, les gens. {myPhotoCount}/
            {MOMENT_PHOTOS_MAX_PER_PERSON}
          </Text>
        </View>
      ) : myPhotoCount >= MOMENT_PHOTOS_MAX_PER_PERSON ? (
        <Text style={styles.hint}>
          {MOMENT_PHOTOS_MAX_PER_PERSON}/{MOMENT_PHOTOS_MAX_PER_PERSON} photos
          ajoutées.
        </Text>
      ) : null}
    </View>
  );
}

/** Demande d’accord : une à la fois (un seul bouton principal à l’écran). */
export function MomentPhotoConsentCard({
  photo,
  outing,
  remaining,
  onAccept,
  onDecline,
}: {
  photo: MomentPhoto;
  outing: Outing;
  remaining: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.consentText}>
        {photo.uploaderName} a ajouté une photo de votre moment «{' '}
        {outing.title} ». Tu es d’accord pour qu’elle apparaisse sur vos
        profils ?
      </Text>
      <View style={styles.photosRow}>
        <MomentPhotoTile uri={photo.uri} width={200} />
      </View>
      <Text style={styles.hint}>
        Sans ton accord, elle reste privée.
      </Text>
      <Button title="J’accepte" onPress={onAccept} style={styles.consentBtn} />
      <Button
        title="Non merci"
        variant="secondary"
        onPress={onDecline}
        style={styles.consentBtnSecondary}
      />
      {remaining > 0 ? (
        <Text style={styles.hint}>
          {remaining === 1
            ? 'Encore 1 photo à voir après celle-ci.'
            : `Encore ${remaining} photos à voir après celle-ci.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  momentTitle: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  photosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  photoCell: { gap: 4 },
  tile: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  table: {
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platesRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plate: { borderWidth: 1.5, borderColor: colors.textSecondary },
  glass: {
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    borderRadius: 3,
  },
  status: {
    ...typography.small,
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
  },
  statusPending: { color: colors.warning },
  link: {
    ...typography.small,
    color: colors.text,
    fontFamily: fonts.semiBold,
    textDecorationLine: 'underline',
  },
  addBlock: { marginTop: spacing.md, gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  consentText: { ...typography.body, color: colors.text },
  consentBtn: { marginTop: spacing.lg },
  consentBtnSecondary: { marginTop: spacing.sm },
});
