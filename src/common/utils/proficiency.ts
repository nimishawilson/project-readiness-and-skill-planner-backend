import { ProficiencyLevel } from '../../generated/prisma/enums';

/** Prisma can't order-compare enums, so rank the levels explicitly. */
export const levelRank: Record<ProficiencyLevel, number> = {
  [ProficiencyLevel.BEGINNER]: 1,
  [ProficiencyLevel.INTERMEDIATE]: 2,
  [ProficiencyLevel.EXPERT]: 3,
};

/** True when `actual` is equal to or higher than `required`. */
export const meetsLevel = (
  actual: ProficiencyLevel,
  required: ProficiencyLevel,
): boolean => levelRank[actual] >= levelRank[required];
