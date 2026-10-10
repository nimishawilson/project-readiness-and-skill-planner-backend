import { ProficiencyLevel } from '../../generated/prisma/enums';

export class EmployeeSkillView {
  skillId: number;
  skill: string;
  level: ProficiencyLevel;
}

export const employeeSkillSelect = {
  skillId: true,
  level: true,
  skill: { select: { name: true } },
} as const;

export function toSkillView(row: {
  skillId: number;
  level: ProficiencyLevel;
  skill: { name: string };
}): EmployeeSkillView {
  return { skillId: row.skillId, skill: row.skill.name, level: row.level };
}
