import { ProficiencyLevel } from '../generated/prisma/enums';
import { computeReadiness } from './readiness';
import { ReadinessStatus } from './readiness-status';

const { BEGINNER, INTERMEDIATE, EXPERT } = ProficiencyLevel;

const req = (
  id: number,
  skillId: number,
  minLevel: ProficiencyLevel,
  peopleRequired: number,
) => ({
  id,
  skillId,
  skill: { name: `skill${skillId}` },
  minLevel,
  peopleRequired,
});
const person = (...skills: [number, ProficiencyLevel][]) => ({
  skills: skills.map(([skillId, level]) => ({ skillId, level })),
});

describe('computeReadiness', () => {
  it('is READY when there are no requirements', () => {
    expect(computeReadiness([], [])).toEqual({
      status: ReadinessStatus.READY,
      requirements: [],
    });
  });

  it('matches the spec example: Angular x2 beginner, Java x1 intermediate', () => {
    const result = computeReadiness(
      [req(1, 1, BEGINNER, 2), req(2, 2, INTERMEDIATE, 1)],
      [person([1, BEGINNER]), person([2, INTERMEDIATE])],
    );
    expect(result.status).toBe(ReadinessStatus.NOT_READY);
    expect(result.requirements).toEqual([
      expect.objectContaining({
        requirementId: 1,
        skill: 'skill1',
        required: 2,
        qualifiedAssigned: 1,
        additionalNeeded: 1,
      }),
      expect.objectContaining({
        requirementId: 2,
        required: 1,
        qualifiedAssigned: 1,
        additionalNeeded: 0,
      }),
    ]);
  });

  it('is READY once every requirement is met', () => {
    const result = computeReadiness(
      [req(1, 1, BEGINNER, 2)],
      [person([1, BEGINNER]), person([1, EXPERT])],
    );
    expect(result.status).toBe(ReadinessStatus.READY);
    expect(result.requirements[0].additionalNeeded).toBe(0);
  });

  it('counts equal or higher levels but not lower ones', () => {
    const result = computeReadiness(
      [req(1, 1, INTERMEDIATE, 3)],
      [person([1, BEGINNER]), person([1, INTERMEDIATE]), person([1, EXPERT])],
    );
    expect(result.requirements[0].qualifiedAssigned).toBe(2);
    expect(result.requirements[0].additionalNeeded).toBe(1);
  });

  it('floors additionalNeeded at zero when over-staffed', () => {
    const result = computeReadiness(
      [req(1, 1, BEGINNER, 1)],
      [person([1, EXPERT]), person([1, EXPERT]), person([1, BEGINNER])],
    );
    expect(result.requirements[0].qualifiedAssigned).toBe(3);
    expect(result.requirements[0].additionalNeeded).toBe(0);
  });

  it('ignores assignees without the skill and counts one person toward several rows', () => {
    const result = computeReadiness(
      [req(1, 1, BEGINNER, 1), req(2, 1, EXPERT, 1), req(3, 2, BEGINNER, 1)],
      [person([1, EXPERT]), person([3, EXPERT])],
    );
    expect(result.requirements.map((r) => r.qualifiedAssigned)).toEqual([
      1, 1, 0,
    ]);
    expect(result.status).toBe(ReadinessStatus.NOT_READY);
  });

  it('is NOT_READY with requirements and nobody assigned', () => {
    const result = computeReadiness([req(1, 1, BEGINNER, 2)], []);
    expect(result.status).toBe(ReadinessStatus.NOT_READY);
    expect(result.requirements[0].additionalNeeded).toBe(2);
  });
});
