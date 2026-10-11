import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { EmployeeSkillsService } from './employee-skills.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' });

describe('EmployeeSkillsService', () => {
  const employeeSkill = {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const skill = { findMany: jest.fn() };
  const employee = { findMany: jest.fn() };
  const teamAccess = { assertTeamMember: jest.fn() };
  const skills = { assertExists: jest.fn() };
  const service = new EmployeeSkillsService(
    { employeeSkill, skill, employee } as never,
    teamAccess as never,
    skills as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    teamAccess.assertTeamMember.mockResolvedValue(undefined);
    skills.assertExists.mockResolvedValue(undefined);
  });

  it('lists skill views after the team check', async () => {
    employeeSkill.findMany.mockResolvedValue([
      { skillId: 1, level: 'BEGINNER', skill: { name: 'Angular' } },
    ]);
    await expect(service.list(7, 5)).resolves.toEqual([
      { skillId: 1, skill: 'Angular', level: 'BEGINNER' },
    ]);
    expect(teamAccess.assertTeamMember).toHaveBeenCalledWith(7, 5);
  });

  it('does not touch skills when the team check fails', async () => {
    teamAccess.assertTeamMember.mockRejectedValue(new ForbiddenException());
    await expect(service.list(7, 5)).rejects.toThrow(ForbiddenException);
    await expect(service.add(7, 5, 1, 'EXPERT')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.updateLevel(7, 5, 1, 'EXPERT')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.remove(7, 5, 1)).rejects.toThrow(ForbiddenException);
    expect(employeeSkill.findMany).not.toHaveBeenCalled();
    expect(employeeSkill.create).not.toHaveBeenCalled();
  });

  describe('add', () => {
    it('creates the mapping', async () => {
      employeeSkill.create.mockResolvedValue({
        skillId: 1,
        level: 'EXPERT',
        skill: { name: 'Angular' },
      });
      await expect(service.add(7, 5, 1, 'EXPERT')).resolves.toEqual({
        skillId: 1,
        skill: 'Angular',
        level: 'EXPERT',
      });
    });

    it('404s for an unknown skill', async () => {
      skills.assertExists.mockRejectedValue(new NotFoundException());
      await expect(service.add(7, 5, 99, 'EXPERT')).rejects.toThrow(
        NotFoundException,
      );
      expect(employeeSkill.create).not.toHaveBeenCalled();
    });

    it('409s when already mapped (P2002)', async () => {
      employeeSkill.create.mockRejectedValue(prismaError('P2002'));
      await expect(service.add(7, 5, 1, 'EXPERT')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows other errors', async () => {
      const err = prismaError('P2034');
      employeeSkill.create.mockRejectedValue(err);
      await expect(service.add(7, 5, 1, 'EXPERT')).rejects.toBe(err);
    });
  });

  describe('updateLevel / remove', () => {
    it('updates by compound key', async () => {
      employeeSkill.update.mockResolvedValue({
        skillId: 1,
        level: 'EXPERT',
        skill: { name: 'Angular' },
      });
      await service.updateLevel(7, 5, 1, 'EXPERT');
      expect(employeeSkill.update.mock.calls[0][0].where).toEqual({
        employeeId_skillId: { employeeId: 5, skillId: 1 },
      });
    });

    it('404s when the mapping is missing (P2025)', async () => {
      employeeSkill.update.mockRejectedValue(prismaError('P2025'));
      employeeSkill.delete.mockRejectedValue(prismaError('P2025'));
      await expect(service.updateLevel(7, 5, 1, 'EXPERT')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.remove(7, 5, 1)).rejects.toThrow(NotFoundException);
    });
  });

  it('lists own skills without ids', async () => {
    employeeSkill.findMany.mockResolvedValue([
      { skillId: 1, level: 'BEGINNER', skill: { name: 'Angular' } },
    ]);
    await expect(service.listMine(5)).resolves.toEqual([
      { skill: 'Angular', level: 'BEGINNER' },
    ]);
  });

  describe('matrix', () => {
    it('builds levels, omits missing skills and keeps skill-less employees', async () => {
      skill.findMany.mockResolvedValue([
        { id: 2, name: 'java' },
        { id: 1, name: 'Angular' },
      ]);
      employee.findMany.mockResolvedValue([
        { id: 5, name: 'Asha', skills: [{ skillId: 1, level: 'BEGINNER' }] },
        { id: 6, name: 'Ravi', skills: [] },
      ]);
      const res = await service.matrix(7, {});
      expect(res.skills.map((s) => s.name)).toEqual(['Angular', 'java']);
      expect(res.employees).toEqual([
        { id: 5, name: 'Asha', levels: { '1': 'BEGINNER' } },
        { id: 6, name: 'Ravi', levels: {} },
      ]);
      expect(employee.findMany.mock.calls[0][0].where).toEqual({
        managerId: 7,
      });
    });

    it('validates and applies skill and department filters', async () => {
      skill.findMany.mockResolvedValue([]);
      employee.findMany.mockResolvedValue([]);
      await service.matrix(7, { skillId: [1, 1, 2], departmentId: 3 });
      expect(skills.assertExists).toHaveBeenCalledTimes(2);
      expect(skill.findMany.mock.calls[0][0].where).toEqual({
        id: { in: [1, 2] },
      });
      expect(employee.findMany.mock.calls[0][0].where).toEqual({
        managerId: 7,
        departmentId: 3,
      });
    });

    it('404s for an unknown skill filter', async () => {
      skills.assertExists.mockRejectedValue(new NotFoundException());
      await expect(service.matrix(7, { skillId: [99] })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
