import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { currentYear } from '../common/utils/current-year';
import { Prisma } from '../generated/prisma/client';
import { ProjectsService } from './projects.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' });

describe('ProjectsService', () => {
  const project = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const projectRequirement = {
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
  };
  const projectAssignment = { findMany: jest.fn() };
  const prisma = {
    project,
    projectRequirement,
    projectAssignment,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const skills = { assertExists: jest.fn() };
  const service = new ProjectsService(prisma as never, skills as never);

  const year = currentYear();
  const reqRow = (over = {}) => ({
    id: 1,
    skillId: 1,
    minLevel: 'BEGINNER',
    peopleRequired: 2,
    skill: { name: 'Angular' },
    ...over,
  });
  const row = (over: Record<string, unknown> = {}) => ({
    id: 10,
    name: 'Portal',
    description: null,
    createdAt: new Date(),
    createdById: 7,
    years: [{ year }],
    requirements: [reqRow()],
    ...over,
  });
  const assignment = (projectId: number, id: number, name: string) => ({
    projectId,
    employee: {
      id,
      name,
      skills: [{ skillId: 1, level: 'EXPERT', skill: { name: 'Angular' } }],
    },
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    skills.assertExists.mockResolvedValue(undefined);
    projectAssignment.findMany.mockResolvedValue([]);
  });

  describe('assertOwned', () => {
    it('404s a missing project and 403s another manager', async () => {
      project.findUnique.mockResolvedValueOnce(null);
      await expect(service.assertOwned(7, 10)).rejects.toThrow(
        NotFoundException,
      );
      project.findUnique.mockResolvedValueOnce({ createdById: 99, years: [] });
      await expect(service.assertOwned(7, 10)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('passes for the owner', async () => {
      project.findUnique.mockResolvedValue({
        createdById: 7,
        years: [{ year: 2025 }, { year }],
      });
      await expect(service.assertOwned(7, 10)).resolves.toEqual({
        years: [2025, year],
      });
    });
  });

  describe('create', () => {
    it('creates owned by the caller, mapped to the current year', async () => {
      project.create.mockResolvedValue(row({ requirements: [] }));
      const view = await service.create(7, { name: 'Portal' });
      const data = project.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        name: 'Portal',
        createdById: 7,
        years: { create: { year } },
      });
      expect(view).toMatchObject({
        id: 10,
        createdYear: new Date().getFullYear(),
        years: [year],
        readinessStatus: 'READY',
      });
    });

    it('is NOT_READY when requirements are unmet, yet still succeeds', async () => {
      project.create.mockResolvedValue(row());
      const view = await service.create(7, {
        name: 'Portal',
        requirements: [{ skillId: 1, minLevel: 'BEGINNER', peopleRequired: 2 }],
      });
      expect(view.readinessStatus).toBe('NOT_READY');
    });

    it('400s duplicate skill+level pairs without touching the DB', async () => {
      const r = {
        skillId: 1,
        minLevel: 'BEGINNER' as never,
        peopleRequired: 1,
      };
      await expect(
        service.create(7, { name: 'P', requirements: [r, { ...r }] }),
      ).rejects.toThrow(BadRequestException);
      expect(project.create).not.toHaveBeenCalled();
    });

    it('allows the same skill at different levels', async () => {
      project.create.mockResolvedValue(row());
      await service.create(7, {
        name: 'P',
        requirements: [
          { skillId: 1, minLevel: 'BEGINNER', peopleRequired: 1 },
          { skillId: 1, minLevel: 'EXPERT', peopleRequired: 1 },
        ],
      });
      expect(skills.assertExists).toHaveBeenCalledTimes(1);
    });

    it('404s an unknown skill before creating', async () => {
      skills.assertExists.mockRejectedValue(new NotFoundException());
      await expect(
        service.create(7, {
          name: 'P',
          requirements: [
            { skillId: 9, minLevel: 'BEGINNER', peopleRequired: 1 },
          ],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(project.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    const query = { page: 1, pageSize: 20 };

    it('scopes to own projects mapped to the year and searches by name', async () => {
      project.findMany.mockResolvedValue([row()]);
      project.count.mockResolvedValue(1);
      projectAssignment.findMany.mockResolvedValue([assignment(10, 5, 'Asha')]);
      const res = await service.list(7, { ...query, q: ' port ' });
      const arg = project.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({
        createdById: 7,
        years: { some: { year } },
        name: { contains: 'port', mode: 'insensitive' },
      });
      expect(arg).toMatchObject({ skip: 0, take: 20 });
      expect(projectAssignment.findMany.mock.calls[0][0].where).toEqual({
        projectId: { in: [10] },
        year,
      });
      expect(res).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(res.items[0]).toMatchObject({
        id: 10,
        assignedCount: 1,
        readinessStatus: 'NOT_READY',
      });
    });

    it('honours an explicit year', async () => {
      project.findMany.mockResolvedValue([]);
      project.count.mockResolvedValue(0);
      await service.list(7, { ...query, year: 2025 });
      expect(project.findMany.mock.calls[0][0].where.years).toEqual({
        some: { year: 2025 },
      });
    });

    it('filters by readiness first, then pages with an exact total', async () => {
      // 1: needs 2, has 2 qualified -> READY. 2 and 3: nobody -> NOT_READY.
      project.findMany.mockResolvedValue([
        row({ id: 1 }),
        row({ id: 2 }),
        row({ id: 3 }),
      ]);
      projectAssignment.findMany.mockResolvedValue([
        assignment(1, 5, 'Asha'),
        assignment(1, 6, 'Ravi'),
      ]);
      const notReady = await service.list(7, {
        page: 1,
        pageSize: 1,
        readiness: 'NOT_READY' as never,
      });
      expect(notReady.total).toBe(2);
      expect(notReady.items.map((i) => i.id)).toEqual([2]);
      const page2 = await service.list(7, {
        page: 2,
        pageSize: 1,
        readiness: 'NOT_READY' as never,
      });
      expect(page2.items.map((i) => i.id)).toEqual([3]);
      const ready = await service.list(7, {
        ...query,
        readiness: 'READY' as never,
      });
      expect(ready.items.map((i) => i.id)).toEqual([1]);
      expect(project.count).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('shows assigned employees and remaining headcount', async () => {
      project.findUnique.mockResolvedValue(row());
      projectAssignment.findMany.mockResolvedValue([
        assignment(10, 6, 'Ravi'),
        assignment(10, 5, 'Asha'),
      ]);
      const detail = await service.get(7, 10);
      expect(detail.year).toBe(year);
      expect(detail.assignedEmployees.map((e) => e.name)).toEqual([
        'Asha',
        'Ravi',
      ]);
      expect(detail.assignedEmployees[0]).toEqual({
        employeeId: 5,
        name: 'Asha',
        skills: [{ skill: 'Angular', level: 'EXPERT' }],
      });
      expect(detail.requirements[0]).toMatchObject({
        required: 2,
        qualifiedAssigned: 2,
        additionalNeeded: 0,
      });
      expect(detail.readinessStatus).toBe('READY');
    });

    it('403s a non-owner', async () => {
      project.findUnique.mockResolvedValue(row({ createdById: 99 }));
      await expect(service.get(7, 10)).rejects.toThrow(ForbiddenException);
    });

    it('404s an explicit year the project is not mapped to', async () => {
      project.findUnique.mockResolvedValue(row());
      await expect(service.get(7, 10, 1999)).rejects.toThrow(NotFoundException);
    });

    it('falls back to the latest mapped year when not mapped to the current one', async () => {
      project.findUnique.mockResolvedValue(
        row({ years: [{ year: 2020 }, { year: 2022 }] }),
      );
      const detail = await service.get(7, 10);
      expect(detail.year).toBe(2022);
      expect(projectAssignment.findMany.mock.calls[0][0].where.year).toBe(2022);
    });
  });

  describe('update', () => {
    it('400s an empty body before any lookup', async () => {
      await expect(service.update(7, 10, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(project.findUnique).not.toHaveBeenCalled();
    });

    it('403s a non-owner without writing', async () => {
      project.findUnique.mockResolvedValue({ createdById: 99, years: [] });
      await expect(service.update(7, 10, { name: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(project.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields', async () => {
      project.findUnique.mockResolvedValue({ createdById: 7, years: [] });
      project.update.mockResolvedValue(row({ name: 'New' }));
      const view = await service.update(7, 10, { name: 'New' });
      expect(project.update.mock.calls[0][0].data).toEqual({ name: 'New' });
      expect(view.name).toBe('New');
    });
  });

  describe('requirements', () => {
    beforeEach(() => {
      project.findUnique.mockResolvedValue({ createdById: 7, years: [] });
    });

    it('adds a requirement', async () => {
      projectRequirement.create.mockResolvedValue(reqRow());
      await expect(
        service.addRequirement(7, 10, {
          skillId: 1,
          minLevel: 'BEGINNER',
          peopleRequired: 2,
        }),
      ).resolves.toEqual({
        id: 1,
        skillId: 1,
        skill: 'Angular',
        minLevel: 'BEGINNER',
        peopleRequired: 2,
      });
      expect(projectRequirement.create.mock.calls[0][0].data.projectId).toBe(
        10,
      );
    });

    it('409s a duplicate skill+level (P2002) on add', async () => {
      projectRequirement.create.mockRejectedValue(prismaError('P2002'));
      await expect(
        service.addRequirement(7, 10, {
          skillId: 1,
          minLevel: 'BEGINNER',
          peopleRequired: 2,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('does not write when the caller does not own the project', async () => {
      project.findUnique.mockResolvedValue({ createdById: 99, years: [] });
      await expect(
        service.addRequirement(7, 10, {
          skillId: 1,
          minLevel: 'BEGINNER',
          peopleRequired: 2,
        }),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.removeRequirement(7, 10, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(projectRequirement.create).not.toHaveBeenCalled();
      expect(projectRequirement.deleteMany).not.toHaveBeenCalled();
    });

    it('400s an empty update', async () => {
      await expect(service.updateRequirement(7, 10, 1, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('scopes update to the project and 404s a requirement of another project', async () => {
      projectRequirement.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.updateRequirement(7, 10, 55, { peopleRequired: 3 }),
      ).rejects.toThrow(NotFoundException);
      expect(projectRequirement.updateMany.mock.calls[0][0].where).toEqual({
        id: 55,
        projectId: 10,
      });
    });

    it('updates and returns the requirement', async () => {
      projectRequirement.updateMany.mockResolvedValue({ count: 1 });
      projectRequirement.findFirst.mockResolvedValue(
        reqRow({ peopleRequired: 3 }),
      );
      const res = await service.updateRequirement(7, 10, 1, {
        peopleRequired: 3,
      });
      expect(projectRequirement.updateMany.mock.calls[0][0].data).toEqual({
        peopleRequired: 3,
      });
      expect(res.peopleRequired).toBe(3);
    });

    it('409s a level change that collides (P2002)', async () => {
      projectRequirement.updateMany.mockRejectedValue(prismaError('P2002'));
      await expect(
        service.updateRequirement(7, 10, 1, { minLevel: 'EXPERT' }),
      ).rejects.toThrow(ConflictException);
    });

    it('removes scoped by project and 404s when nothing matched', async () => {
      projectRequirement.deleteMany.mockResolvedValue({ count: 1 });
      await expect(
        service.removeRequirement(7, 10, 1),
      ).resolves.toBeUndefined();
      expect(projectRequirement.deleteMany.mock.calls[0][0].where).toEqual({
        id: 1,
        projectId: 10,
      });
      projectRequirement.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.removeRequirement(7, 10, 2)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
  describe('getReadiness', () => {
    it('returns the contract shape with remaining headcount', async () => {
      project.findUnique.mockResolvedValue(row());
      projectAssignment.findMany.mockResolvedValue([assignment(10, 5, 'Asha')]);
      await expect(service.getReadiness(7, 10)).resolves.toEqual({
        projectId: 10,
        year,
        status: 'NOT_READY',
        requirements: [
          {
            requirementId: 1,
            skillId: 1,
            skill: 'Angular',
            minLevel: 'BEGINNER',
            required: 2,
            qualifiedAssigned: 1,
            additionalNeeded: 1,
          },
        ],
      });
      expect(projectAssignment.findMany.mock.calls[0][0].where).toEqual({
        projectId: { in: [10] },
        year,
      });
    });

    it('is READY once the requirement is met', async () => {
      project.findUnique.mockResolvedValue(row());
      projectAssignment.findMany.mockResolvedValue([
        assignment(10, 5, 'Asha'),
        assignment(10, 6, 'Ravi'),
      ]);
      const res = await service.getReadiness(7, 10);
      expect(res.status).toBe('READY');
      expect(res.requirements[0].additionalNeeded).toBe(0);
    });

    it('is READY with an empty list when there are no requirements', async () => {
      project.findUnique.mockResolvedValue(row({ requirements: [] }));
      await expect(service.getReadiness(7, 10)).resolves.toMatchObject({
        status: 'READY',
        requirements: [],
      });
    });

    it('is NOT_READY with nobody assigned', async () => {
      project.findUnique.mockResolvedValue(row());
      const res = await service.getReadiness(7, 10);
      expect(res.status).toBe('NOT_READY');
      expect(res.requirements[0]).toMatchObject({
        qualifiedAssigned: 0,
        additionalNeeded: 2,
      });
    });

    it('404s a missing project and 403s a non-owner before reading assignments', async () => {
      project.findUnique.mockResolvedValueOnce(null);
      await expect(service.getReadiness(7, 10)).rejects.toThrow(
        NotFoundException,
      );
      project.findUnique.mockResolvedValueOnce(row({ createdById: 99 }));
      await expect(service.getReadiness(7, 10)).rejects.toThrow(
        ForbiddenException,
      );
      expect(projectAssignment.findMany).not.toHaveBeenCalled();
    });

    it('evaluates an explicit mapped past year, 404s an unmapped one', async () => {
      project.findUnique.mockResolvedValue(
        row({ years: [{ year: 2020 }, { year }] }),
      );
      const res = await service.getReadiness(7, 10, 2020);
      expect(res.year).toBe(2020);
      expect(projectAssignment.findMany.mock.calls[0][0].where.year).toBe(2020);
      await expect(service.getReadiness(7, 10, 1999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('falls back to the latest mapped year when not mapped to the current one', async () => {
      project.findUnique.mockResolvedValue(
        row({ years: [{ year: 2020 }, { year: 2022 }] }),
      );
      const res = await service.getReadiness(7, 10);
      expect(res.year).toBe(2022);
      expect(projectAssignment.findMany.mock.calls[0][0].where.year).toBe(2022);
    });
  });
  describe('default-year views (update / getProjectView)', () => {
    const pastOnly = () =>
      row({ years: [{ year: year - 3 }, { year: year - 2 }] });

    it('update evaluates readiness for the latest mapped year when not mapped to the current one', async () => {
      project.findUnique.mockResolvedValue({ createdById: 7, years: [] });
      project.update.mockResolvedValue(pastOnly());
      projectAssignment.findMany.mockResolvedValue([
        assignment(10, 5, 'Asha'),
        assignment(10, 6, 'Ravi'),
      ]);
      const view = await service.update(7, 10, { name: 'New' });
      expect(projectAssignment.findMany.mock.calls[0][0].where.year).toBe(
        year - 2,
      );
      expect(view.readinessStatus).toBe('READY');
    });

    it('update still uses the current year when the project is mapped to it', async () => {
      project.findUnique.mockResolvedValue({ createdById: 7, years: [] });
      project.update.mockResolvedValue(row());
      await service.update(7, 10, { name: 'New' });
      expect(projectAssignment.findMany.mock.calls[0][0].where.year).toBe(year);
    });

    it('getProjectView returns the shape with years, owner-checked', async () => {
      project.findUnique.mockResolvedValue(
        row({ years: [{ year }, { year: year + 1 }] }),
      );
      await expect(service.getProjectView(7, 10)).resolves.toMatchObject({
        id: 10,
        years: [year, year + 1],
        readinessStatus: 'NOT_READY',
      });
      project.findUnique.mockResolvedValue(row({ createdById: 99 }));
      await expect(service.getProjectView(7, 10)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
