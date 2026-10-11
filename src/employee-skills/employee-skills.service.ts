import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeamAccessService } from '../auth/team-access.service';
import {
  EmployeeSkillView,
  employeeSkillSelect,
  toSkillView,
} from '../common/mappers/skill.mapper';
import { Prisma } from '../generated/prisma/client';
import { ProficiencyLevel } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import { MySkillItemDto } from './dto/my-skill.dto';
import { SkillsMatrixDto } from './dto/skills-matrix-response.dto';
import { SkillsMatrixQueryDto } from './dto/skills-matrix-query.dto';

const byName = { skill: { name: 'asc' } } as const;

@Injectable()
export class EmployeeSkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
    private readonly skills: SkillsService,
  ) {}

  async list(
    managerId: number,
    employeeId: number,
  ): Promise<EmployeeSkillView[]> {
    await this.teamAccess.assertTeamMember(managerId, employeeId);
    const rows = await this.prisma.employeeSkill.findMany({
      where: { employeeId },
      select: employeeSkillSelect,
      orderBy: byName,
    });
    return rows.map(toSkillView);
  }

  async add(
    managerId: number,
    employeeId: number,
    skillId: number,
    level: ProficiencyLevel,
  ): Promise<EmployeeSkillView> {
    await this.teamAccess.assertTeamMember(managerId, employeeId);
    await this.skills.assertExists(skillId);
    try {
      const row = await this.prisma.employeeSkill.create({
        data: { employeeId, skillId, level },
        select: employeeSkillSelect,
      });
      return toSkillView(row);
    } catch (err) {
      if (this.isPrismaError(err, 'P2002')) {
        throw new ConflictException('Employee already has this skill');
      }
      throw err;
    }
  }

  async updateLevel(
    managerId: number,
    employeeId: number,
    skillId: number,
    level: ProficiencyLevel,
  ): Promise<EmployeeSkillView> {
    await this.teamAccess.assertTeamMember(managerId, employeeId);
    try {
      const row = await this.prisma.employeeSkill.update({
        where: { employeeId_skillId: { employeeId, skillId } },
        data: { level },
        select: employeeSkillSelect,
      });
      return toSkillView(row);
    } catch (err) {
      this.rethrowNotMapped(err);
      throw err;
    }
  }

  async remove(
    managerId: number,
    employeeId: number,
    skillId: number,
  ): Promise<void> {
    await this.teamAccess.assertTeamMember(managerId, employeeId);
    try {
      await this.prisma.employeeSkill.delete({
        where: { employeeId_skillId: { employeeId, skillId } },
      });
    } catch (err) {
      this.rethrowNotMapped(err);
      throw err;
    }
  }

  async listMine(employeeId: number): Promise<MySkillItemDto[]> {
    const rows = await this.prisma.employeeSkill.findMany({
      where: { employeeId },
      select: employeeSkillSelect,
      orderBy: byName,
    });
    return rows.map(({ skill, level }) => ({ skill: skill.name, level }));
  }

  async matrix(
    managerId: number,
    query: SkillsMatrixQueryDto,
  ): Promise<SkillsMatrixDto> {
    const filter = [...new Set(query.skillId ?? [])];
    for (const id of filter) await this.skills.assertExists(id);

    const [skillRows, employees] = await Promise.all([
      this.prisma.skill.findMany({
        where: filter.length ? { id: { in: filter } } : undefined,
        select: { id: true, name: true },
      }),
      this.prisma.employee.findMany({
        where: {
          managerId,
          ...(query.departmentId !== undefined && {
            departmentId: query.departmentId,
          }),
        },
        select: {
          id: true,
          name: true,
          skills: {
            where: filter.length ? { skillId: { in: filter } } : undefined,
            select: { skillId: true, level: true },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);

    skillRows.sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
        a.id - b.id,
    );

    return {
      skills: skillRows,
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        levels: Object.fromEntries(
          e.skills.map((s) => [String(s.skillId), s.level]),
        ),
      })),
    };
  }

  private rethrowNotMapped(err: unknown) {
    if (this.isPrismaError(err, 'P2025')) {
      throw new NotFoundException('Employee does not have this skill');
    }
  }

  private isPrismaError(err: unknown, code: string) {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
    );
  }
}
