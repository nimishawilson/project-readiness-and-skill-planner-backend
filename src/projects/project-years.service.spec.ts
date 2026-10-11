import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { currentYear } from '../common/utils/current-year';
import { Prisma } from '../generated/prisma/client';
import { ProjectYearsService } from './project-years.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' });

describe('ProjectYearsService', () => {
  const year = currentYear();
  const projectYear = {
    findMany: jest.fn(),
    create: jest.fn(),
  };
  const projectAssignment = { findMany: jest.fn(), createMany: jest.fn() };
  const $queryRaw = jest.fn();
  const tx = { $queryRaw, projectYear, projectAssignment };
  const prisma = {
    projectYear,
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const projects = { assertOwned: jest.fn(), getProjectView: jest.fn() };
  const service = new ProjectYearsService(prisma as never, projects as never);

  const mapped = (...years: number[]) =>
    projectYear.findMany.mockResolvedValueOnce(years.map((y) => ({ year: y })));
  const view = { id: 10, years: [year, year + 1] };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) =>
      cb(tx),
    );
    projects.assertOwned.mockResolvedValue({ years: [year] });
    projects.getProjectView.mockResolvedValue(view);
    $queryRaw.mockResolvedValue([]);
    projectAssignment.findMany.mockResolvedValue([]);
  });

  describe('mapYear', () => {
    it('locks the project, creates the year and copies the latest year’s assignments', async () => {
      mapped(year);
      projectAssignment.findMany.mockResolvedValue([
        { employeeId: 5 },
        { employeeId: 6 },
      ]);
      await expect(service.mapYear(7, 10, year + 1)).resolves.toBe(view);
      expect($queryRaw).toHaveBeenCalledTimes(1);
      expect($queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        projectYear.findMany.mock.invocationCallOrder[0],
      );
      expect(projectYear.create.mock.calls[0][0].data).toEqual({
        projectId: 10,
        year: year + 1,
      });
      expect(projectAssignment.findMany.mock.calls[0][0].where).toEqual({
        projectId: 10,
        year,
      });
      expect(projectAssignment.createMany.mock.calls[0][0].data).toEqual([
        { projectId: 10, year: year + 1, employeeId: 5 },
        { projectId: 10, year: year + 1, employeeId: 6 },
      ]);
      expect(projects.getProjectView).toHaveBeenCalledWith(7, 10);
    });

    it('copies from the latest mapped year, not an earlier one', async () => {
      mapped(year - 2, year);
      await service.mapYear(7, 10, year + 1);
      expect(projectAssignment.findMany.mock.calls[0][0].where.year).toBe(year);
    });

    it('skips the copy when nobody is assigned', async () => {
      mapped(year);
      await service.mapYear(7, 10, year + 1);
      expect(projectYear.create).toHaveBeenCalled();
      expect(projectAssignment.createMany).not.toHaveBeenCalled();
    });

    it('maps an old project to the current year (not yet mapped)', async () => {
      mapped(year - 2);
      projectAssignment.findMany.mockResolvedValue([{ employeeId: 5 }]);
      await service.mapYear(7, 10, year);
      expect(projectAssignment.findMany.mock.calls[0][0].where.year).toBe(
        year - 2,
      );
      expect(projectAssignment.createMany.mock.calls[0][0].data).toEqual([
        { projectId: 10, year, employeeId: 5 },
      ]);
    });

    it('409s a year the project is already mapped to', async () => {
      mapped(year, year + 1);
      await expect(service.mapYear(7, 10, year + 1)).rejects.toThrow(
        `Project is already mapped to ${year + 1}`,
      );
      expect(projectYear.create).not.toHaveBeenCalled();
    });

    it('409s a year before the current year', async () => {
      mapped(year - 3);
      await expect(service.mapYear(7, 10, year - 1)).rejects.toThrow(
        'current year or later',
      );
      expect(projectYear.create).not.toHaveBeenCalled();
    });

    it('409s a year at or before the latest mapped year, even when >= current', async () => {
      mapped(year, year + 2);
      await expect(service.mapYear(7, 10, year + 1)).rejects.toThrow(
        `after the project's latest mapped year (${year + 2})`,
      );
      expect(projectYear.create).not.toHaveBeenCalled();
      expect(projectAssignment.createMany).not.toHaveBeenCalled();
    });

    it('409s a lost race on the year row (P2002)', async () => {
      mapped(year);
      projectYear.create.mockRejectedValue(prismaError('P2002'));
      await expect(service.mapYear(7, 10, year + 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows other errors', async () => {
      mapped(year);
      const err = prismaError('P2034');
      projectYear.create.mockRejectedValue(err);
      await expect(service.mapYear(7, 10, year + 1)).rejects.toBe(err);
    });

    it('never opens a transaction for a non-owner or unknown project', async () => {
      projects.assertOwned.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.mapYear(7, 10, year + 1)).rejects.toThrow(
        ForbiddenException,
      );
      projects.assertOwned.mockRejectedValueOnce(new NotFoundException());
      await expect(service.mapYear(7, 10, year + 1)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('listYears', () => {
    it('returns years ascending with assigned counts, including zero', async () => {
      projectYear.findMany.mockResolvedValue([
        { year: year, _count: { assignments: 4 } },
        { year: year + 1, _count: { assignments: 0 } },
      ]);
      await expect(service.listYears(7, 10)).resolves.toEqual([
        { year, assignedCount: 4 },
        { year: year + 1, assignedCount: 0 },
      ]);
      expect(projectYear.findMany.mock.calls[0][0]).toMatchObject({
        where: { projectId: 10 },
        orderBy: { year: 'asc' },
      });
    });

    it('checks ownership first', async () => {
      projects.assertOwned.mockRejectedValue(new ForbiddenException());
      await expect(service.listYears(7, 10)).rejects.toThrow(
        ForbiddenException,
      );
      expect(projectYear.findMany).not.toHaveBeenCalled();
    });
  });
});
