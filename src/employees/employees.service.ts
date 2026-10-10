import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TeamAccessService } from '../auth/team-access.service';
import { learningGoalSelect, toGoalView } from '../common/mappers/goal.mapper';
import {
  employeeSkillSelect,
  toSkillView,
} from '../common/mappers/skill.mapper';
import { Paginated, skipTake, toPage } from '../common/pagination/paginate';
import { currentYear } from '../common/utils/current-year';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeListItemDto } from './dto/employee-list-item.dto';
import { EmployeeProfileDto } from './dto/employee-profile.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { MyProfileDto } from './dto/my-profile.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const listItemSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  department: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

const BCRYPT_ROUNDS = 10;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly team: TeamAccessService,
  ) {}

  async list(
    managerId: number,
    query: ListEmployeesQueryDto,
  ): Promise<Paginated<EmployeeListItemDto>> {
    const where: Prisma.EmployeeWhereInput = { managerId };
    if (query.departmentId !== undefined)
      where.departmentId = query.departmentId;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: listItemSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...skipTake(query),
      }),
      this.prisma.employee.count({ where }),
    ]);
    return toPage(items, total, query);
  }

  async getProfile(
    managerId: number,
    employeeId: number,
  ): Promise<EmployeeProfileDto> {
    await this.team.assertTeamMember(managerId, employeeId);
    const e = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        email: true,
        managerId: true,
        department: { select: { id: true, name: true } },
        skills: {
          select: employeeSkillSelect,
          orderBy: { skill: { name: 'asc' } },
        },
        learningGoals: {
          where: { year: currentYear() },
          select: learningGoalSelect,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    return {
      ...e,
      skills: e.skills.map(toSkillView),
      learningGoals: e.learningGoals.map(toGoalView),
    };
  }

  async create(
    managerId: number,
    dto: CreateEmployeeDto,
  ): Promise<EmployeeListItemDto> {
    await this.assertDepartmentExists(dto.departmentId);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.employee.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: Role.EMPLOYEE,
          managerId,
          departmentId: dto.departmentId,
        },
        select: listItemSelect,
      });
    } catch (err) {
      this.rethrowEmailConflict(err);
      throw err;
    }
  }

  async update(
    managerId: number,
    employeeId: number,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeListItemDto> {
    await this.team.assertTeamMember(managerId, employeeId);
    if (dto.departmentId != null) {
      await this.assertDepartmentExists(dto.departmentId);
    }
    try {
      return await this.prisma.employee.update({
        where: { id: employeeId },
        data: {
          name: dto.name,
          email: dto.email,
          departmentId: dto.departmentId,
        },
        select: listItemSelect,
      });
    } catch (err) {
      this.rethrowEmailConflict(err);
      throw err;
    }
  }

  async getMyProfile(employeeId: number): Promise<MyProfileDto> {
    const e = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        email: true,
        department: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        skills: {
          select: employeeSkillSelect,
          orderBy: { skill: { name: 'asc' } },
        },
      },
    });
    return {
      ...e,
      skills: e.skills.map(({ skill, level }) => ({
        skill: skill.name,
        level,
      })),
    };
  }

  private async assertDepartmentExists(departmentId: number) {
    const found = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Department not found');
  }

  private rethrowEmailConflict(err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('Email already exists');
    }
  }
}
