import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamAccessService } from './team-access.service';

describe('TeamAccessService', () => {
  const findUnique = jest.fn();
  const service = new TeamAccessService({
    employee: { findUnique },
  } as never);

  it('passes for a team member', async () => {
    findUnique.mockResolvedValue({ managerId: 1 });
    await expect(service.assertTeamMember(1, 5)).resolves.toBeUndefined();
  });

  it('forbids an employee on another team', async () => {
    findUnique.mockResolvedValue({ managerId: 2 });
    await expect(service.assertTeamMember(1, 5)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s for a missing employee', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.assertTeamMember(1, 99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
