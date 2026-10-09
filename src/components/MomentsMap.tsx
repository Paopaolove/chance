import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Outing, OutingCategory } from '../data/types';
import { colors } from '../theme';
import { formatParisTime } from '../utils/parisTime';
import {
  PARIS_REGION,
  clampRegion,
  outingCoords,
  regionChanged,
} from '../utils/parisGeo';

const ICONS: Record<OutingCategory, keyof typeof Ionicons.glyphMap> = {
  sport: 'football-outline',
  culture: 'ticket-outline',
  restaurant: 'restaurant-outline',
  bar: 'wine-outline',
  autre: 'sparkles-outline',
};

type Props = {
  outings: Outing[];
  onOpen: (outingId: string) => void;
  emptyOverlay?: React.ReactNode;
};

/** Carte des moments — pas des personnes : aucun prénom, aucune photo. */
export function MomentsMap({ outings, onOpen, emptyOverlay }: Props) {
  const mapRef = useRef<MapView>(null);
  const points = useMemo(
    () =>
      outings
        .map((o) => ({ o, c: outingCoords(o) }))
        .filter((x): x is { o: Outing; c: NonNullable<ReturnType<typeof outingCoords>> } => !!x.c),
    [outings],
  );

  const onRegionChangeComplete = (r: Region) => {
    const c = clampRegion(r);
    if (regionChanged(c, r)) mapRef.current?.animateToRegion(c, 200);
  };

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={PARIS_REGION}
        minZoomLevel={11.5}
        maxZoomLevel={18}
        cameraZoomRange={{ minCenterCoordinateDistance: 400, maxCenterCoordinateDistance: 18000, animated: false }}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {points.map(({ o, c }) => {
          const urgent = !!o.urgentOnSite;
          return (
            <Marker
              key={o.id}
              coordinate={c}
              onPress={() => onOpen(o.id)}
              tracksViewChanges={false}
              accessibilityLabel={`${o.title}, ${formatParisTime(o.startsAt)}`}
            >
              <View style={[styles.pin, urgent && styles.pinUrgent]}>
                <Ionicons
                  name={ICONS[o.category] ?? 'sparkles-outline'}
                  size={16}
                  color={urgent ? colors.white : colors.text}
                />
              </View>
            </Marker>
          );
        })}
      </MapView>
      {points.length === 0 && emptyOverlay ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.overlayCard}>{emptyOverlay}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinUrgent: { backgroundColor: colors.primary, borderColor: colors.primary },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', padding: 24 },
  overlayCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
});
