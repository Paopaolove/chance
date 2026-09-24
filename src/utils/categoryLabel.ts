import { categoryLabels } from '../data/mockOutings';
import type { OutingCategory } from '../data/types';

/** For Autre, show the free detail instead of the word « Autre ». */
export function formatOutingCategoryLabel(
  category: OutingCategory,
  categoryDetail?: string | null,
): string {
  if (category === 'autre') {
    const detail = categoryDetail?.trim();
    if (detail) return detail;
  }
  return categoryLabels[category];
}
