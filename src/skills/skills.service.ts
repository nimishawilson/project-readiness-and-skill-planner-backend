import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SkillDto } from './dto/skill.dto';

const skillSelect = { id: true, name: true } as const;

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SkillDto[]> {
    const skills = await this.prisma.skill.findMany({ select: skillSelect });
    return skills.sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
        a.id - b.id,
    );
  }

  async create(name: string): Promise<SkillDto> {
    await this.assertNameFree(name);
    try {
      return await this.prisma.skill.create({
        data: { name },
        select: skillSelect,
      });
    } catch (err) {
      this.rethrowDuplicate(err);
      throw err;
    }
  }

  async rename(id: number, name: string): Promise<SkillDto> {
    await this.assertExists(id);
    await this.assertNameFree(name, id);
    try {
      return await this.prisma.skill.update({
        where: { id },
        data: { name },
        select: skillSelect,
      });
    } catch (err) {
      this.rethrowDuplicate(err);
      throw err;
    }
  }

  async remove(id: number): Promise<void> {
    await this.assertExists(id);
    const [employees, requirements] = await Promise.all([
      this.prisma.employeeSkill.count({ where: { skillId: id } }),
      this.prisma.projectRequirement.count({ where: { skillId: id } }),
    ]);
    if (employees || requirements) {
      throw this.inUse(employees, requirements);
    }
    try {
      await this.prisma.skill.delete({ where: { id } });
    } catch (err) {
      // FK Restrict backstop for a mapping created after the counts above.
      if (this.isPrismaError(err, 'P2003')) {
        throw new ConflictException(
          'Skill is mapped to employees or used in project requirements',
        );
      }
      throw err;
    }
  }

  /** Shared by employee-skill and project-requirement endpoints (404). */
  async assertExists(id: number): Promise<void> {
    const found = await this.prisma.skill.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Skill not found');
  }

  private async assertNameFree(name: string, excludeId?: number) {
    const clash = await this.prisma.skill.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId !== undefined && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Skill name already exists');
  }

  private inUse(employees: number, requirements: number) {
    const parts: string[] = [];
    if (employees) parts.push(`mapped to ${employees} employee(s)`);
    if (requirements) {
      parts.push(`used in ${requirements} project requirement(s)`);
    }
    return new ConflictException(`Skill is ${parts.join(' and ')}`);
  }

  private rethrowDuplicate(err: unknown) {
    if (this.isPrismaError(err, 'P2002')) {
      throw new ConflictException('Skill name already exists');
    }
  }

  private isPrismaError(err: unknown, code: string) {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
    );
  }
}
