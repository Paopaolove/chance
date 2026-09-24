/**
 * Demo travel-time model for Paris intramuros.
 * Neighborhoods → rough lat/lng; minutes ≈ metro/walk blend (not real routing).
 */

import { PARIS_NEIGHBORHOODS } from './neighborhoods';

/** Soft relevance window for the feed (~30–40 min). */
export const RELEVANCE_MAX_MINUTES = 40;

type Coords = { lat: number; lng: number };

/** Approximate centers for list neighborhoods (Paris). */
const COORDS: Record<string, Coords> = {
  'Le Marais': { lat: 48.857, lng: 2.359 },
  Oberkampf: { lat: 48.864, lng: 2.38 },
  Bastille: { lat: 48.853, lng: 2.369 },
  République: { lat: 48.867, lng: 2.363 },
  'Canal Saint-Martin': { lat: 48.871, lng: 2.366 },
  Belleville: { lat: 48.872, lng: 2.383 },
  Ménilmontant: { lat: 48.866, lng: 2.389 },
  Nation: { lat: 48.848, lng: 2.396 },
  Montmartre: { lat: 48.886, lng: 2.343 },
  Pigalle: { lat: 48.882, lng: 2.337 },
  Opéra: { lat: 48.871, lng: 2.332 },
  'Grands Boulevards': { lat: 48.871, lng: 2.343 },
  Châtelet: { lat: 48.858, lng: 2.347 },
  'Les Halles': { lat: 48.862, lng: 2.347 },
  Louvre: { lat: 48.861, lng: 2.336 },
  'Saint-Germain': { lat: 48.854, lng: 2.333 },
  'Quartier Latin': { lat: 48.849, lng: 2.346 },
  Odéon: { lat: 48.85, lng: 2.339 },
  Montparnasse: { lat: 48.842, lng: 2.324 },
  Denfert: { lat: 48.834, lng: 2.332 },
  'Place d’Italie': { lat: 48.831, lng: 2.356 },
  'Bastille / Faubourg': { lat: 48.851, lng: 2.377 },
  Charonne: { lat: 48.855, lng: 2.395 },
  'Père Lachaise': { lat: 48.861, lng: 2.394 },
  'Buttes-Chaumont': { lat: 48.88, lng: 2.383 },
  Jaurès: { lat: 48.883, lng: 2.371 },
  'La Villette': { lat: 48.893, lng: 2.39 },
  Stalingrad: { lat: 48.884, lng: 2.368 },
  'Gare de Lyon': { lat: 48.844, lng: 2.374 },
  Bercy: { lat: 48.839, lng: 2.382 },
  Tolbiac: { lat: 48.827, lng: 2.358 },
  Gobelins: { lat: 48.835, lng: 2.353 },
  Alésia: { lat: 48.828, lng: 2.327 },
  'Porte de Versailles': { lat: 48.832, lng: 2.288 },
  Invalides: { lat: 48.86, lng: 2.313 },
  'Tour Eiffel': { lat: 48.858, lng: 2.294 },
  Trocadéro: { lat: 48.863, lng: 2.287 },
  Passy: { lat: 48.858, lng: 2.28 },
  Auteuil: { lat: 48.848, lng: 2.26 },
  Batignolles: { lat: 48.887, lng: 2.316 },
  'Place de Clichy': { lat: 48.884, lng: 2.327 },
  'Saint-Lazare': { lat: 48.876, lng: 2.325 },
  Madeleine: { lat: 48.87, lng: 2.324 },
  Concorde: { lat: 48.866, lng: 2.321 },
  'Champs-Élysées': { lat: 48.87, lng: 2.308 },
};

function haversineKm(a: Coords, b: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function resolveCoords(neighborhood: string): Coords {
  if (COORDS[neighborhood]) return COORDS[neighborhood];
  // Fuzzy: first list entry containing / contained by name
  const key = Object.keys(COORDS).find(
    (k) =>
      k.toLowerCase() === neighborhood.toLowerCase() ||
      neighborhood.toLowerCase().includes(k.toLowerCase()) ||
      k.toLowerCase().includes(neighborhood.toLowerCase()),
  );
  if (key) return COORDS[key];
  // Fallback: Paris centre
  return { lat: 48.8566, lng: 2.3522 };
}

/**
 * Approximate door-to-door minutes (walk + metro blend).
 * Same quartier ≈ 8–12 min; farther scales with distance.
 */
export function getTravelMinutes(from: string, to: string): number {
  if (!from || !to) return 25;
  const a = from.trim();
  const b = to.trim();
  if (a.toLowerCase() === b.toLowerCase()) return 10;

  const km = haversineKm(resolveCoords(a), resolveCoords(b));
  // ~4.2 min/km urban transit + 8 min access overhead
  const raw = 8 + km * 4.2;
  // Snap to friendly 5-min steps, clamp 5–75
  const snapped = Math.round(raw / 5) * 5;
  return Math.max(5, Math.min(75, snapped));
}

export function formatTravelMinutes(minutes: number): string {
  return `~${minutes} min`;
}

export function isWithinRelevance(
  from: string,
  to: string,
  maxMinutes = RELEVANCE_MAX_MINUTES,
): boolean {
  return getTravelMinutes(from, to) <= maxMinutes;
}

/** Ensure every pick-list quartier has coords (dev sanity). */
export function missingNeighborhoodCoords(): string[] {
  return PARIS_NEIGHBORHOODS.filter((n) => !COORDS[n]);
}
