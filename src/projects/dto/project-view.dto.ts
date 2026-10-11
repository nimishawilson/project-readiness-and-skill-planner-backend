import { MySkillItemDto } from '../../employee-skills/dto/my-skill.dto';
import { ProficiencyLevel } from '../../generated/prisma/enums';
import { ReadinessStatus } from '../readiness-status';

export class ProjectViewDto {
  id: number;
  name: string;
  description: string | null;
  /** Year of the project's creation date. */
  createdYear: number;
  /** Years the project is mapped to, ascending. */
  years: number[];
  readinessStatus: ReadinessStatus;
}

export class ProjectListItemDto extends ProjectViewDto {
  /** Employees assigned in the listed year. */
  assignedCount: number;
}

export class AssignedEmployeeDto {
  employeeId: number;
  name: string;
  skills: MySkillItemDto[];
}

export class RequirementReadinessDto {
  requirementId: number;
  skillId: number;
  skill: string;
  minLevel: ProficiencyLevel;
  required: number;
  qualifiedAssigned: number;
  additionalNeeded: number;
}

export class ProjectDetailDto extends ProjectViewDto {
  /** The year the assignments and readiness are shown for. */
  year: number;
  assignedEmployees: AssignedEmployeeDto[];
  requirements: RequirementReadinessDto[];
}

export class RequirementDto {
  id: number;
  skillId: number;
  skill: string;
  minLevel: ProficiencyLevel;
  peopleRequired: number;
}
