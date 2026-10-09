/**
 * Carte des moments — Paris intramuros uniquement.
 * Pas de géocodage : coordonnées dérivées du quartier (table statique de
 * centroïdes) + léger décalage déterministe par moment pour que les points
 * ne se superposent pas.
 */
export type LatLng = { latitude: number; longitude: number };

export const PARIS_CENTER: LatLng = { latitude: 48.8566, longitude: 2.3522 };

/** Boîte Paris intramuros (périphérique + bois). */
export const PARIS_BOUNDS = {
  minLat: 48.815,
  maxLat: 48.902,
  minLng: 2.224,
  maxLng: 2.47,
};

export const PARIS_REGION = {
  latitude: 48.8586,
  longitude: 2.3436,
  latitudeDelta: 0.1,
  longitudeDelta: 0.13,
};
/** Zoom arrière maximal : jamais plus large que Paris. */
export const PARIS_MAX_DELTA = 0.12;

const CENTROIDS: Record<string, [number, number]> = {
  'le marais': [48.8592, 2.3622],
  oberkampf: [48.8649, 2.3765],
  bastille: [48.8532, 2.3691],
  'bastille / faubourg': [48.8515, 2.3765],
  république: [48.8674, 2.3636],
  'canal saint-martin': [48.8718, 2.3653],
  belleville: [48.8722, 2.3768],
  ménilmontant: [48.8665, 2.3885],
  nation: [48.8483, 2.3958],
  montmartre: [48.8867, 2.3431],
  pigalle: [48.8822, 2.3376],
  opéra: [48.8708, 2.3322],
  'grands boulevards': [48.8714, 2.3452],
  châtelet: [48.8582, 2.347],
  'les halles': [48.8622, 2.3451],
  louvre: [48.8606, 2.3376],
  'saint-germain': [48.8539, 2.3338],
  'quartier latin': [48.8493, 2.3471],
  odéon: [48.8517, 2.3388],
  montparnasse: [48.8421, 2.3219],
  denfert: [48.8339, 2.3324],
  'place d’italie': [48.8311, 2.3557],
  charonne: [48.8545, 2.3885],
  'père lachaise': [48.8614, 2.3933],
  'buttes-chaumont': [48.8809, 2.3828],
  jaurès: [48.8826, 2.3702],
  'la villette': [48.8938, 2.3889],
  stalingrad: [48.8843, 2.3685],
  'gare de lyon': [48.8443, 2.3743],
  bercy: [48.8386, 2.3826],
  tolbiac: [48.8262, 2.3571],
  gobelins: [48.8357, 2.3524],
  alésia: [48.8281, 2.3268],
  'porte de versailles': [48.8325, 2.2878],
  invalides: [48.8566, 2.3126],
  'tour eiffel': [48.8584, 2.2945],
  trocadéro: [48.8627, 2.2875],
  passy: [48.8577, 2.2803],
  auteuil: [48.8478, 2.2696],
  batignolles: [48.8873, 2.3175],
  'place de clichy': [48.8836, 2.3274],
  'saint-lazare': [48.8763, 2.3253],
  madeleine: [48.8700, 2.3245],
  concorde: [48.8656, 2.3212],
  'champs-élysées': [48.8698, 2.3076],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/'/g, '’');

export function neighborhoodCentroid(name: string | undefined): LatLng | null {
  if (!name) return null;
  const k = norm(name);
  const hit = CENTROIDS[k] ?? Object.entries(CENTROIDS).find(([n]) => k.includes(n))?.[1];
  return hit ? { latitude: hit[0], longitude: hit[1] } : null;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Décalage déterministe ±~250 m. */
export function jitter(id: string): { dLat: number; dLng: number } {
  const h = hash(id);
  return {
    dLat: ((h & 0xffff) / 0xffff - 0.5) * 0.0045,
    dLng: (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.0065,
  };
}

export function isInParis(p: LatLng): boolean {
  return (
    p.latitude >= PARIS_BOUNDS.minLat &&
    p.latitude <= PARIS_BOUNDS.maxLat &&
    p.longitude >= PARIS_BOUNDS.minLng &&
    p.longitude <= PARIS_BOUNDS.maxLng
  );
}

/** Coordonnées d’un moment : explicites sinon quartier + décalage. null si hors Paris / inconnu. */
export function outingCoords(o: {
  id: string;
  neighborhood?: string;
  approxArea?: string;
  latitude?: number;
  longitude?: number;
}): LatLng | null {
  let p: LatLng | null =
    typeof o.latitude === 'number' && typeof o.longitude === 'number'
      ? { latitude: o.latitude, longitude: o.longitude }
      : null;
  if (!p) {
    const c = neighborhoodCentroid(o.neighborhood) ?? neighborhoodCentroid(o.approxArea);
    if (!c) return null;
    const j = jitter(o.id);
    p = { latitude: c.latitude + j.dLat, longitude: c.longitude + j.dLng };
  }
  return isInParis(p) ? p : null;
}

/** Ramène une région dans Paris (pan / zoom bornés). */
export function clampRegion<R extends LatLng & { latitudeDelta: number; longitudeDelta: number }>(r: R): R {
  const latitudeDelta = Math.min(r.latitudeDelta, PARIS_MAX_DELTA);
  const longitudeDelta = Math.min(r.longitudeDelta, PARIS_MAX_DELTA * 1.3);
  const latitude = Math.min(Math.max(r.latitude, PARIS_BOUNDS.minLat), PARIS_BOUNDS.maxLat);
  const longitude = Math.min(Math.max(r.longitude, PARIS_BOUNDS.minLng), PARIS_BOUNDS.maxLng);
  return { ...r, latitude, longitude, latitudeDelta, longitudeDelta };
}

export function regionChanged(a: LatLng & { latitudeDelta: number }, b: LatLng & { latitudeDelta: number }) {
  return (
    Math.abs(a.latitude - b.latitude) > 1e-5 ||
    Math.abs(a.longitude - b.longitude) > 1e-5 ||
    Math.abs(a.latitudeDelta - b.latitudeDelta) > 1e-5
  );
}
