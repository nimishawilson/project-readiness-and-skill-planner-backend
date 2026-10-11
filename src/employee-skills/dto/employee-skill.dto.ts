import { ProficiencyLevel } from '../../generated/prisma/enums';

export class EmployeeSkillDto {
  skillId: number;
  skill: string;
  level: ProficiencyLevel;
}
