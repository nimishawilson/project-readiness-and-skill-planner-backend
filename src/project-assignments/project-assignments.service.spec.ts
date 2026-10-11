import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { currentYear } from '../common/utils/current-year';
import { Prisma } from '../generated/prisma/client';
import { ProjectAssignmentsService } from './project-assignments.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' });

describe('ProjectAssignmentsService', () => {
  const projectAssignment = {
    create: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  };
  const projects = { assertOwned: jest.fn(), loadAssignees: jest.fn() };
  const teamAccess = { assertTeamMember: jest.fn() };
  const service = new ProjectAssignmentsService(
    { projectAssignment } as never,
    projects as never,
    teamAccess as never,
  );

  const year = currentYear();
  const assignee = (employeeId: number, name: string) => ({
    employeeId,
    name,
    skills: [{ skillId: 1, level: 'EXPERT', skill: { name: 'Angular' } }],
  });
  const created = (employeeId = 5) => ({
    year,
    employee: {
      id: employeeId,
      name: 'Asha',
      skills: [{ skillId: 1, level: 'BEGINNER', skill: { name: 'Angular' } }],
    },
  });

  beforeEach(() => {
    jest.resetAllMocks();
    projects.assertOwned.mockResolvedValue({ years: [year] });
    teamAccess.assertTeamMember.mockResolvedValue(undefined);
  });

  describe('list', () => {
    it('lists the current year assignees with trimmed skills', async () => {
      projects.loadAssignees.mockResolvedValue(
        new Map([[10, [assignee(5, 'Asha')]]]),
      );
      await expect(service.list(7, 10)).resolves.toEqual([
        {
          employeeId: 5,
          name: 'Asha',
          skills: [{ skill: 'Angular', level: 'EXPERT' }],
        },
      ]);
      expect(projects.loadAssignees).toHaveBeenCalledWith([10], year);
    });

    it('returns an empty list when nobody is assigned', async () => {
      projects.loadAssignees.mockResolvedValue(new Map());
      await expect(service.list(7, 10)).resolves.toEqual([]);
    });

    it('falls back to the latest mapped year when not mapped to the current one', async () => {
      projects.assertOwned.mockResolvedValue({ years: [2020, 2022] });
      projects.loadAssignees.mockResolvedValue(new Map());
      await service.list(7, 10);
      expect(projects.loadAssignees).toHaveBeenCalledWith([10], 2022);
    });

    it('reads an explicit mapped past year, 404s an unmapped one', async () => {
      projects.assertOwned.mockResolvedValue({ years: [2020, year] });
      projects.loadAssignees.mockResolvedValue(new Map());
      await service.list(7, 10, 2020);
      expect(projects.loadAssignees).toHaveBeenCalledWith([10], 2020);
      await expect(service.list(7, 10, 1999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propagates the ownership failure before reading', async () => {
      projects.assertOwned.mockRejectedValue(new ForbiddenException());
      await expect(service.list(7, 10)).rejects.toThrow(ForbiddenException);
      expect(projects.loadAssignees).not.toHaveBeenCalled();
    });
  });

  describe('assign', () => {
    it('creates the assignment for the current year', async () => {
      projectAssignment.create.mockResolvedValue(created());
      await expect(service.assign(7, 10, { employeeId: 5 })).resolves.toEqual({
        year,
        employeeId: 5,
        name: 'Asha',
        skills: [{ skill: 'Angular', level: 'BEGINNER' }],
      });
      expect(projectAssignment.create.mock.calls[0][0].data).toEqual({
        projectId: 10,
        year,
        employeeId: 5,
      });
      expect(teamAccess.assertTeamMember).toHaveBeenCalledWith(7, 5);
    });

    it('accepts an explicit year equal to the current year', async () => {
      projectAssignment.create.mockResolvedValue(created());
      await expect(
        service.assign(7, 10, { employeeId: 5, year }),
      ).resolves.toBeDefined();
    });

    it('does not write for a non-owner', async () => {
      projects.assertOwned.mockRejectedValue(new ForbiddenException());
      await expect(service.assign(7, 10, { employeeId: 5 })).rejects.toThrow(
        ForbiddenException,
      );
      expect(teamAccess.assertTeamMember).not.toHaveBeenCalled();
      expect(projectAssignment.create).not.toHaveBeenCalled();
    });

    it('does not write for an employee outside the team', async () => {
      teamAccess.assertTeamMember.mockRejectedValue(new ForbiddenException());
      await expect(service.assign(7, 10, { employeeId: 5 })).rejects.toThrow(
        ForbiddenException,
      );
      expect(projectAssignment.create).not.toHaveBeenCalled();
    });

    it('409s any year other than the current one, past or future', async () => {
      projects.assertOwned.mockResolvedValue({ years: [year - 1, year] });
      for (const bad of [year - 1, year + 1]) {
        await expect(
          service.assign(7, 10, { employeeId: 5, year: bad }),
        ).rejects.toThrow(ConflictException);
      }
      expect(projectAssignment.create).not.toHaveBeenCalled();
    });

    it('409s when the project is not mapped to the current year', async () => {
      projects.assertOwned.mockResolvedValue({ years: [year - 1] });
      await expect(service.assign(7, 10, { employeeId: 5 })).rejects.toThrow(
        `Project is not mapped to ${year}`,
      );
      expect(projectAssignment.create).not.toHaveBeenCalled();
    });

    it('409s a duplicate (P2002) and a lost race on the year/employee (P2003)', async () => {
      projectAssignment.create.mockRejectedValueOnce(prismaError('P2002'));
      await expect(service.assign(7, 10, { employeeId: 5 })).rejects.toThrow(
        'already assigned',
      );
      projectAssignment.create.mockRejectedValueOnce(prismaError('P2003'));
      await expect(service.assign(7, 10, { employeeId: 5 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows unknown errors', async () => {
      const err = prismaError('P2034');
      projectAssignment.create.mockRejectedValue(err);
      await expect(service.assign(7, 10, { employeeId: 5 })).rejects.toBe(err);
    });
  });

  describe('unassign', () => {
    it('deletes the current-year assignment scoped to the project', async () => {
      projectAssignment.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.unassign(7, 10, 5)).resolves.toBeUndefined();
      expect(projectAssignment.deleteMany.mock.calls[0][0].where).toEqual({
        projectId: 10,
        year,
        employeeId: 5,
      });
    });

    it('404s when the employee is not assigned', async () => {
      projectAssignment.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.unassign(7, 10, 5)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409s a non-current year and checks ownership first', async () => {
      await expect(service.unassign(7, 10, 5, year - 1)).rejects.toThrow(
        ConflictException,
      );
      expect(projectAssignment.deleteMany).not.toHaveBeenCalled();
      projects.assertOwned.mockRejectedValue(new ForbiddenException());
      await expect(service.unassign(7, 10, 5, year - 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('does not require the employee to still be on the team', async () => {
      projectAssignment.deleteMany.mockResolvedValue({ count: 1 });
      await service.unassign(7, 10, 5);
      expect(teamAccess.assertTeamMember).not.toHaveBeenCalled();
    });
  });

  describe('listForEmployee', () => {
    const row = (id: number, name: string, y = year) => ({
      year: y,
      projectYear: { project: { id, name, description: null } },
    });

    it('checks the team first and maps rows', async () => {
      projectAssignment.findMany.mockResolvedValue([row(1, 'Alpha')]);
      await expect(service.listForEmployee(7, 5)).resolves.toEqual([
        { id: 1, name: 'Alpha', description: null, year },
      ]);
      expect(teamAccess.assertTeamMember).toHaveBeenCalledWith(7, 5);
    });

    it('defaults to the current year and only the caller’s projects', async () => {
      projectAssignment.findMany.mockResolvedValue([]);
      await service.listForEmployee(7, 5);
      expect(projectAssignment.findMany.mock.calls[0][0].where).toEqual({
        employeeId: 5,
        year,
        projectYear: { project: { createdById: 7 } },
      });
    });

    it('honours an explicit year', async () => {
      projectAssignment.findMany.mockResolvedValue([]);
      await service.listForEmployee(7, 5, 2024);
      expect(projectAssignment.findMany.mock.calls[0][0].where.year).toBe(2024);
    });

    it('does not query for an employee outside the team', async () => {
      teamAccess.assertTeamMember.mockRejectedValue(new ForbiddenException());
      await expect(service.listForEmployee(7, 5)).rejects.toThrow(
        ForbiddenException,
      );
      expect(projectAssignment.findMany).not.toHaveBeenCalled();
    });
  });
  describe('employee’s own projects (listMyCurrent / listMyPast)', () => {
    const row = (id: number, name: string, y: number) => ({
      year: y,
      projectYear: { project: { id, name, description: `${name} d` } },
    });
    const byName = [
      { projectYear: { project: { name: 'asc' } } },
      { projectId: 'asc' },
    ];

    it('current: this year’s assignments, ordered by project name', async () => {
      projectAssignment.findMany.mockResolvedValue([row(1, 'Alpha', year)]);
      await expect(service.listMyCurrent(5)).resolves.toEqual([
        { id: 1, name: 'Alpha', description: 'Alpha d', year },
      ]);
      const arg = projectAssignment.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ employeeId: 5, year });
      expect(arg.orderBy).toEqual(byName);
    });

    it('past: earlier years only, newest year first', async () => {
      projectAssignment.findMany.mockResolvedValue([
        row(2, 'Beta', year - 1),
        row(1, 'Alpha', year - 2),
      ]);
      await expect(service.listMyPast(5)).resolves.toEqual([
        { id: 2, name: 'Beta', description: 'Beta d', year: year - 1 },
        { id: 1, name: 'Alpha', description: 'Alpha d', year: year - 2 },
      ]);
      const arg = projectAssignment.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ employeeId: 5, year: { lt: year } });
      expect(arg.orderBy).toEqual([{ year: 'desc' }, ...byName]);
    });

    it('returns an empty list when there are no rows', async () => {
      projectAssignment.findMany.mockResolvedValue([]);
      await expect(service.listMyCurrent(5)).resolves.toEqual([]);
      await expect(service.listMyPast(5)).resolves.toEqual([]);
    });

    it('applies no team check or ownership filter', async () => {
      projectAssignment.findMany.mockResolvedValue([]);
      await service.listMyCurrent(5);
      await service.listMyPast(5);
      expect(teamAccess.assertTeamMember).not.toHaveBeenCalled();
      for (const [arg] of projectAssignment.findMany.mock.calls) {
        expect(JSON.stringify(arg.where)).not.toContain('createdById');
      }
    });

    it('never exposes future years (past uses lt, current uses equality)', async () => {
      projectAssignment.findMany.mockResolvedValue([]);
      await service.listMyCurrent(5);
      await service.listMyPast(5);
      const calls = projectAssignment.findMany.mock.calls;
      expect(calls[0][0].where.year).toBe(year);
      expect(calls[1][0].where.year).toEqual({ lt: year });
    });
  });
});
