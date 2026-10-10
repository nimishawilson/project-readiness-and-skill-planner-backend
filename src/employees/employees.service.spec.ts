import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  const employee = {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  };
  const department = { findUnique: jest.fn() };
  const prisma = {
    employee,
    department,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const assertTeamMember = jest.fn();
  const service = new EmployeesService(
    prisma as never,
    {
      assertTeamMember,
    } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    assertTeamMember.mockResolvedValue(undefined);
    department.findUnique.mockResolvedValue({ id: 1 });
    employee.findMany.mockResolvedValue([]);
    employee.count.mockResolvedValue(0);
  });

  describe('list', () => {
    it('always scopes to the caller’s team', async () => {
      await service.list(7, { page: 1, pageSize: 20 });
      expect(employee.findMany.mock.calls[0][0].where).toEqual({
        managerId: 7,
      });
    });

    it('applies search and department filters', async () => {
      await service.list(7, {
        page: 2,
        pageSize: 10,
        q: ' ash ',
        departmentId: 3,
      });
      const args = employee.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        managerId: 7,
        departmentId: 3,
        OR: [
          { name: { contains: 'ash', mode: 'insensitive' } },
          { email: { contains: 'ash', mode: 'insensitive' } },
        ],
      });
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
    });

    it('returns pagination metadata', async () => {
      employee.count.mockResolvedValue(57);
      await expect(
        service.list(7, { page: 2, pageSize: 20 }),
      ).resolves.toMatchObject({ page: 2, pageSize: 20, total: 57 });
    });
  });

  describe('create', () => {
    const dto = {
      name: 'New',
      email: 'new@example.com',
      password: 'password123',
      departmentId: 1,
    };

    it('hashes the password and forces role and manager', async () => {
      employee.create.mockResolvedValue({ id: 9 });
      await service.create(7, dto);
      const { data } = employee.create.mock.calls[0][0];
      expect(data.role).toBe('EMPLOYEE');
      expect(data.managerId).toBe(7);
      expect(data.passwordHash).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, data.passwordHash)).toBe(true);
    });

    it('404s for an unknown department', async () => {
      department.findUnique.mockResolvedValue(null);
      await expect(service.create(7, dto)).rejects.toThrow(NotFoundException);
      expect(employee.create).not.toHaveBeenCalled();
    });

    it('409s on a duplicate email', async () => {
      employee.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(service.create(7, dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('stops when the employee is not on the team', async () => {
      assertTeamMember.mockRejectedValue(new ForbiddenException());
      await expect(service.update(7, 5, { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(employee.update).not.toHaveBeenCalled();
    });

    it('allows clearing the department with null', async () => {
      employee.update.mockResolvedValue({ id: 5 });
      await service.update(7, 5, { departmentId: null });
      expect(department.findUnique).not.toHaveBeenCalled();
      expect(employee.update.mock.calls[0][0].data.departmentId).toBeNull();
    });
  });

  describe('getProfile', () => {
    it('checks team membership and never returns passwordHash', async () => {
      employee.findUniqueOrThrow.mockResolvedValue({
        id: 5,
        name: 'Asha',
        email: 'a@x.com',
        managerId: 7,
        department: null,
        skills: [{ skillId: 1, level: 'BEGINNER', skill: { name: 'Angular' } }],
        learningGoals: [],
      });
      const profile = await service.getProfile(7, 5);
      expect(assertTeamMember).toHaveBeenCalledWith(7, 5);
      expect(profile.skills).toEqual([
        { skillId: 1, skill: 'Angular', level: 'BEGINNER' },
      ]);
      expect(JSON.stringify(profile)).not.toContain('passwordHash');
      const select = employee.findUniqueOrThrow.mock.calls[0][0].select;
      expect(select.passwordHash).toBeUndefined();
      expect(select.learningGoals.where.year).toBe(new Date().getFullYear());
    });
  });
});
