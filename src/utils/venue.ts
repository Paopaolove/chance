/** Stable key for aggregating venue reviews across outings. */
export function makeVenueKey(venueName: string, neighborhood: string): string {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  return `${norm(venueName)}|${norm(neighborhood)}`;
}
