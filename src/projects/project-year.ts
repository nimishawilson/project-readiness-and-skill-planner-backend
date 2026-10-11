import { NotFoundException } from '@nestjs/common';
import { currentYear } from '../common/utils/current-year';

/**
 * Picks the year to show for a project mapped to `years` (ascending).
 * An explicit year must be mapped (404). Omitted: the current year if mapped,
 * otherwise the latest mapped year.
 */
export function resolveProjectYear(
  years: number[],
  requested?: number,
): number {
  if (requested !== undefined) {
    if (!years.includes(requested)) {
      throw new NotFoundException(`Project is not mapped to ${requested}`);
    }
    return requested;
  }
  const current = currentYear();
  if (years.includes(current) || years.length === 0) return current;
  return years[years.length - 1];
}
