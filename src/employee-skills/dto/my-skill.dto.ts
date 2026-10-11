import { ProficiencyLevel } from '../../generated/prisma/enums';

export class MySkillItemDto {
  skill: string;
  level: ProficiencyLevel;
}
