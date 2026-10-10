import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { SkillsService } from './skills.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' });

describe('SkillsService', () => {
  const skill = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const employeeSkill = { count: jest.fn() };
  const projectRequirement = { count: jest.fn() };
  const service = new SkillsService({
    skill,
    employeeSkill,
    projectRequirement,
  } as never);

  beforeEach(() => {
    jest.resetAllMocks();
    skill.findFirst.mockResolvedValue(null);
    skill.findUnique.mockResolvedValue({ id: 1 });
    employeeSkill.count.mockResolvedValue(0);
    projectRequirement.count.mockResolvedValue(0);
  });

  it('lists skills ordered by name, case-insensitively', async () => {
    skill.findMany.mockResolvedValue([
      { id: 1, name: 'sql' },
      { id: 2, name: 'Angular' },
      { id: 3, name: 'Java' },
    ]);
    const names = (await service.list()).map((s) => s.name);
    expect(names).toEqual(['Angular', 'Java', 'sql']);
  });

  describe('create', () => {
    it('creates when the name is free', async () => {
      skill.create.mockResolvedValue({ id: 9, name: 'Docker' });
      await expect(service.create('Docker')).resolves.toEqual({
        id: 9,
        name: 'Docker',
      });
      expect(skill.findFirst.mock.calls[0][0].where.name).toEqual({
        equals: 'Docker',
        mode: 'insensitive',
      });
    });

    it('409s on a case-insensitive duplicate', async () => {
      skill.findFirst.mockResolvedValue({ id: 2 });
      await expect(service.create('angular')).rejects.toThrow(
        ConflictException,
      );
      expect(skill.create).not.toHaveBeenCalled();
    });

    it('409s when the unique index rejects it (race)', async () => {
      skill.create.mockRejectedValue(prismaError('P2002'));
      await expect(service.create('Docker')).rejects.toThrow(ConflictException);
    });
  });

  describe('rename', () => {
    it('404s for an unknown skill', async () => {
      skill.findUnique.mockResolvedValue(null);
      await expect(service.rename(5, 'X')).rejects.toThrow(NotFoundException);
    });

    it('excludes the skill itself from the duplicate check', async () => {
      skill.update.mockResolvedValue({ id: 1, name: 'Angular' });
      await service.rename(1, 'Angular');
      expect(skill.findFirst.mock.calls[0][0].where.id).toEqual({ not: 1 });
    });

    it('409s when another skill has the name', async () => {
      skill.findFirst.mockResolvedValue({ id: 2 });
      await expect(service.rename(1, 'Java')).rejects.toThrow(
        ConflictException,
      );
      expect(skill.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an unused skill', async () => {
      await service.remove(1);
      expect(skill.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('404s for an unknown skill', async () => {
      skill.findUnique.mockResolvedValue(null);
      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
    });

    it('409s with counts when the skill is in use', async () => {
      employeeSkill.count.mockResolvedValue(3);
      projectRequirement.count.mockResolvedValue(1);
      await expect(service.remove(1)).rejects.toThrow(
        'Skill is mapped to 3 employee(s) and used in 1 project requirement(s)',
      );
      expect(skill.delete).not.toHaveBeenCalled();
    });

    it('409s when the FK restricts the delete (race)', async () => {
      skill.delete.mockRejectedValue(prismaError('P2003'));
      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });
  });

  describe('assertExists', () => {
    it('passes for an existing skill and 404s otherwise', async () => {
      await expect(service.assertExists(1)).resolves.toBeUndefined();
      skill.findUnique.mockResolvedValue(null);
      await expect(service.assertExists(2)).rejects.toThrow(NotFoundException);
    });
  });
});
