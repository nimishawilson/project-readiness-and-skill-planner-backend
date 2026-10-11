import { meetsLevel } from '../common/utils/proficiency';
import { ProficiencyLevel } from '../generated/prisma/enums';
import { ReadinessStatus } from './readiness-status';

export interface ReadinessRequirement {
  id: number;
  skillId: number;
  skill: { name: string };
  minLevel: ProficiencyLevel;
  peopleRequired: number;
}

export interface ReadinessAssignee {
  skills: { skillId: number; level: ProficiencyLevel }[];
}

export interface RequirementReadiness {
  requirementId: number;
  skillId: number;
  skill: string;
  minLevel: ProficiencyLevel;
  required: number;
  qualifiedAssigned: number;
  additionalNeeded: number;
}

export interface Readiness {
  status: ReadinessStatus;
  requirements: RequirementReadiness[];
}

/**
 * Per requirement: additionalNeeded = max(0, required - qualifiedAssigned),
 * where qualified means the assignee has the skill at or above minLevel.
 * READY only when every requirement is met (no requirements => READY).
 */
export function computeReadiness(
  requirements: ReadinessRequirement[],
  assignees: ReadinessAssignee[],
): Readiness {
  const rows = requirements.map((r) => {
    const qualifiedAssigned = assignees.filter((a) =>
      a.skills.some(
        (s) => s.skillId === r.skillId && meetsLevel(s.level, r.minLevel),
      ),
    ).length;
    return {
      requirementId: r.id,
      skillId: r.skillId,
      skill: r.skill.name,
      minLevel: r.minLevel,
      required: r.peopleRequired,
      qualifiedAssigned,
      additionalNeeded: Math.max(0, r.peopleRequired - qualifiedAssigned),
    };
  });
  const ready = rows.every((r) => r.additionalNeeded === 0);
  return {
    status: ready ? ReadinessStatus.READY : ReadinessStatus.NOT_READY,
    requirements: rows,
  };
}
