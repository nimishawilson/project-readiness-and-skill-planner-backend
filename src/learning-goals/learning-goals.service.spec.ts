import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { currentYear } from '../common/utils/current-year';
import { LearningGoalsService } from './learning-goals.service';

describe('LearningGoalsService', () => {
  const learningGoal = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  };
  const $queryRaw = jest.fn();
  const tx = { learningGoal, $queryRaw };
  const prisma = {
    learningGoal,
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const teamAccess = { assertTeamMember: jest.fn() };
  const service = new LearningGoalsService(
    prisma as never,
    teamAccess as never,
  );

  const goal = (over: Record<string, unknown> = {}) => ({
    id: 10,
    employeeId: 5,
    title: 'Learn NestJS',
    description: null,
    year: currentYear(),
    progressStatus: 'NOT_STARTED',
    approvalStatus: 'PENDING',
    createdAt: new Date(),
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) =>
      cb(tx),
    );
    teamAccess.assertTeamMember.mockResolvedValue(undefined);
    $queryRaw.mockResolvedValue([]);
    learningGoal.count.mockResolvedValue(0);
  });

  describe('create', () => {
    it('locks the employee, then creates in the current year', async () => {
      learningGoal.create.mockResolvedValue(goal());
      await service.create(7, 5, { title: 'Learn NestJS' });
      expect(teamAccess.assertTeamMember).toHaveBeenCalledWith(7, 5);
      expect($queryRaw).toHaveBeenCalledTimes(1);
      expect($queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        learningGoal.create.mock.invocationCallOrder[0],
      );
      expect(learningGoal.create.mock.calls[0][0].data).toMatchObject({
        employeeId: 5,
        year: currentYear(),
        title: 'Learn NestJS',
      });
    });

    it('allows the 3rd goal but 409s the 4th', async () => {
      learningGoal.create.mockResolvedValue(goal());
      learningGoal.count.mockResolvedValue(2);
      await expect(service.create(7, 5, { title: 'x' })).resolves.toBeDefined();
      learningGoal.count.mockResolvedValue(3);
      await expect(service.create(7, 5, { title: 'x' })).rejects.toThrow(
        ConflictException,
      );
      expect(learningGoal.create).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the team check fails', async () => {
      teamAccess.assertTeamMember.mockRejectedValue(new ForbiddenException());
      await expect(service.create(7, 5, { title: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('lists', () => {
    it('defaults to the current year and orders by creation', async () => {
      learningGoal.findMany.mockResolvedValue([goal()]);
      await service.listForEmployee(7, 5);
      const arg = learningGoal.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ employeeId: 5, year: currentYear() });
      expect(arg.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    });

    it('honours an explicit year for the employee', async () => {
      learningGoal.findMany.mockResolvedValue([]);
      await service.listMine(5, 2025);
      expect(learningGoal.findMany.mock.calls[0][0].where).toEqual({
        employeeId: 5,
        year: 2025,
      });
    });

    it('pending approval is scoped to the manager team', async () => {
      learningGoal.findMany.mockResolvedValue([]);
      await service.pendingApproval(7);
      expect(learningGoal.findMany.mock.calls[0][0].where).toEqual({
        progressStatus: 'COMPLETED',
        approvalStatus: 'PENDING',
        employee: { managerId: 7 },
      });
    });
  });

  describe('update', () => {
    it('404s a missing goal and 403s another team', async () => {
      learningGoal.findUnique.mockResolvedValueOnce(null);
      await expect(service.update(7, 10, { title: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      learningGoal.findUnique.mockResolvedValueOnce(goal());
      teamAccess.assertTeamMember.mockRejectedValue(new ForbiddenException());
      await expect(service.update(7, 10, { title: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(learningGoal.update).not.toHaveBeenCalled();
    });

    it('400s an empty body', async () => {
      await expect(service.update(7, 10, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('409s on an approved goal', async () => {
      learningGoal.findUnique.mockResolvedValue(
        goal({ progressStatus: 'COMPLETED', approvalStatus: 'APPROVED' }),
      );
      await expect(service.update(7, 10, { title: 'x' })).rejects.toThrow(
        ConflictException,
      );
      expect(learningGoal.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields', async () => {
      learningGoal.findUnique.mockResolvedValue(goal());
      learningGoal.update.mockResolvedValue(goal());
      await service.update(7, 10, { progressStatus: 'IN_PROGRESS' });
      expect(learningGoal.update.mock.calls[0][0].data).toEqual({
        progressStatus: 'IN_PROGRESS',
      });
    });

    it('resets approval when a manager moves a goal away from COMPLETED', async () => {
      learningGoal.findUnique.mockResolvedValue(
        goal({ progressStatus: 'COMPLETED' }),
      );
      learningGoal.update.mockResolvedValue(goal());
      await service.update(7, 10, { progressStatus: 'IN_PROGRESS' });
      expect(learningGoal.update.mock.calls[0][0].data).toEqual({
        progressStatus: 'IN_PROGRESS',
        approvalStatus: 'PENDING',
        approvedAt: null,
        approvedById: null,
      });
    });
  });

  describe('approve', () => {
    it('409s unless the goal is completed', async () => {
      learningGoal.findUnique.mockResolvedValue(
        goal({ progressStatus: 'IN_PROGRESS' }),
      );
      await expect(service.approve(7, 10)).rejects.toThrow(ConflictException);
    });

    it('409s when already approved', async () => {
      learningGoal.findUnique.mockResolvedValue(
        goal({ progressStatus: 'COMPLETED', approvalStatus: 'APPROVED' }),
      );
      await expect(service.approve(7, 10)).rejects.toThrow(ConflictException);
      expect(learningGoal.updateMany).not.toHaveBeenCalled();
    });

    it('records who approved', async () => {
      learningGoal.findUnique.mockResolvedValue(
        goal({ progressStatus: 'COMPLETED' }),
      );
      learningGoal.updateMany.mockResolvedValue({ count: 1 });
      await service.approve(7, 10);
      const arg = learningGoal.updateMany.mock.calls[0][0];
      expect(arg.data).toMatchObject({
        approvalStatus: 'APPROVED',
        approvedById: 7,
      });
      expect(arg.data.approvedAt).toBeInstanceOf(Date);
    });

    it('409s when a concurrent change wins', async () => {
      learningGoal.findUnique.mockResolvedValue(
        goal({ progressStatus: 'COMPLETED' }),
      );
      learningGoal.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.approve(7, 10)).rejects.toThrow(ConflictException);
    });
  });

  describe('mapYear', () => {
    it('is a no-op for the same year', async () => {
      learningGoal.findUnique.mockResolvedValue(goal({ year: 2026 }));
      await expect(service.mapYear(7, 10, 2026)).resolves.toMatchObject({
        year: 2026,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('moves the goal when the target year has room, excluding itself', async () => {
      learningGoal.findUnique.mockResolvedValue(goal({ year: 2026 }));
      learningGoal.count.mockResolvedValue(2);
      learningGoal.update.mockResolvedValue(goal({ year: 2027 }));
      await service.mapYear(7, 10, 2027);
      expect(learningGoal.count.mock.calls[0][0].where).toEqual({
        employeeId: 5,
        year: 2027,
        id: { not: 10 },
      });
      expect(learningGoal.update.mock.calls[0][0].data).toEqual({ year: 2027 });
    });

    it('409s when the target year is full', async () => {
      learningGoal.findUnique.mockResolvedValue(goal({ year: 2026 }));
      learningGoal.count.mockResolvedValue(3);
      await expect(service.mapYear(7, 10, 2027)).rejects.toThrow(
        ConflictException,
      );
      expect(learningGoal.update).not.toHaveBeenCalled();
    });
  });

  describe('advanceMyProgress', () => {
    const run = (from: string, to: string) => {
      learningGoal.findFirst.mockResolvedValue({ progressStatus: from });
      learningGoal.updateMany.mockResolvedValue({ count: 1 });
      learningGoal.findUnique.mockResolvedValue(goal({ progressStatus: to }));
      return service.advanceMyProgress(5, 10, to as never);
    };

    it('404s a goal that is missing or not own', async () => {
      learningGoal.findFirst.mockResolvedValue(null);
      await expect(
        service.advanceMyProgress(5, 10, 'IN_PROGRESS'),
      ).rejects.toThrow(NotFoundException);
      expect(learningGoal.findFirst.mock.calls[0][0].where).toEqual({
        id: 10,
        employeeId: 5,
      });
    });

    it.each([
      ['NOT_STARTED', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'COMPLETED'],
    ])('allows %s -> %s', async (from, to) => {
      await expect(run(from, to)).resolves.toMatchObject({
        progressStatus: to,
      });
      expect(learningGoal.updateMany.mock.calls[0][0].where).toMatchObject({
        progressStatus: from,
      });
    });

    it.each([
      ['NOT_STARTED', 'COMPLETED'],
      ['NOT_STARTED', 'NOT_STARTED'],
      ['IN_PROGRESS', 'NOT_STARTED'],
      ['IN_PROGRESS', 'IN_PROGRESS'],
      ['COMPLETED', 'IN_PROGRESS'],
      ['COMPLETED', 'NOT_STARTED'],
      ['COMPLETED', 'COMPLETED'],
    ])('rejects %s -> %s', async (from, to) => {
      await expect(run(from, to)).rejects.toThrow(ConflictException);
      expect(learningGoal.updateMany).not.toHaveBeenCalled();
    });

    it('409s when a concurrent advance wins', async () => {
      learningGoal.findFirst.mockResolvedValue({
        progressStatus: 'NOT_STARTED',
      });
      learningGoal.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.advanceMyProgress(5, 10, 'IN_PROGRESS'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
