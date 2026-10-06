import { categoryLabels } from '../data/mockOutings';
import type { OutingCategory } from '../data/types';

/**
 * Autre : le détail libre remplace le mot « Autre ».
 * Sport : « Sport · Padel » si « Quel sport ? » est rempli.
 */
export function formatOutingCategoryLabel(
  category: OutingCategory,
  categoryDetail?: string | null,
): string {
  if (category === 'autre') {
    const detail = categoryDetail?.trim();
    if (detail) return detail;
  }
  if (category === 'sport') {
    const detail = categoryDetail?.trim();
    if (detail) return `${categoryLabels.sport} · ${detail}`;
  }
  return categoryLabels[category];
}
