import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeamAccessService } from '../auth/team-access.service';
import { employeeSkillSelect } from '../common/mappers/skill.mapper';
import { currentYear } from '../common/utils/current-year';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveProjectYear } from '../projects/project-year';
import { ProjectsService } from '../projects/projects.service';
import { AssignEmployeeDto } from './dto/assign-employee.dto';
import { CreatedAssignmentDto } from './dto/created-assignment.dto';
import { EmployeeProjectDto } from './dto/employee-project.dto';
import { AssignedEmployeeDto } from '../projects/dto/project-view.dto';

const byProjectName: Prisma.ProjectAssignmentOrderByWithRelationInput[] = [
  { projectYear: { project: { name: 'asc' } } },
  { projectId: 'asc' },
];

@Injectable()
export class ProjectAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly teamAccess: TeamAccessService,
  ) {}

  async list(
    managerId: number,
    projectId: number,
    requestedYear?: number,
  ): Promise<AssignedEmployeeDto[]> {
    const { years } = await this.projects.assertOwned(managerId, projectId);
    const year = resolveProjectYear(years, requestedYear);
    const byProject = await this.projects.loadAssignees([projectId], year);
    return (byProject.get(projectId) ?? []).map((a) => ({
      employeeId: a.employeeId,
      name: a.name,
      skills: a.skills.map((s) => ({ skill: s.skill.name, level: s.level })),
    }));
  }

  async assign(
    managerId: number,
    projectId: number,
    dto: AssignEmployeeDto,
  ): Promise<CreatedAssignmentDto> {
    const { years } = await this.projects.assertOwned(managerId, projectId);
    await this.teamAccess.assertTeamMember(managerId, dto.employeeId);
    const year = this.assertCurrentYear(dto.year);
    if (!years.includes(year)) {
      throw new ConflictException(`Project is not mapped to ${year}`);
    }
    try {
      const row = await this.prisma.projectAssignment.create({
        data: { projectId, year, employeeId: dto.employeeId },
        select: {
          year: true,
          employee: {
            select: {
              id: true,
              name: true,
              skills: {
                select: employeeSkillSelect,
                orderBy: { skill: { name: 'asc' } },
              },
            },
          },
        },
      });
      return {
        year: row.year,
        employeeId: row.employee.id,
        name: row.employee.name,
        skills: row.employee.skills.map((s) => ({
          skill: s.skill.name,
          level: s.level,
        })),
      };
    } catch (err) {
      // Backstops for races the checks above can't see.
      if (this.isPrismaError(err, 'P2002')) {
        throw new ConflictException(
          `Employee is already assigned to this project for ${year}`,
        );
      }
      if (this.isPrismaError(err, 'P2003')) {
        throw new ConflictException(
          `Project is not mapped to ${year}, or the employee no longer exists`,
        );
      }
      throw err;
    }
  }

  async unassign(
    managerId: number,
    projectId: number,
    employeeId: number,
    requestedYear?: number,
  ): Promise<void> {
    await this.projects.assertOwned(managerId, projectId);
    const year = this.assertCurrentYear(requestedYear);
    const { count } = await this.prisma.projectAssignment.deleteMany({
      where: { projectId, year, employeeId },
    });
    if (count === 0) {
      throw new NotFoundException(
        `Employee is not assigned to this project for ${year}`,
      );
    }
  }

  /** The manager's own projects an employee is assigned to for a year. */
  async listForEmployee(
    managerId: number,
    employeeId: number,
    year?: number,
  ): Promise<EmployeeProjectDto[]> {
    await this.teamAccess.assertTeamMember(managerId, employeeId);
    return this.findEmployeeProjects(
      {
        employeeId,
        year: year ?? currentYear(),
        projectYear: { project: { createdById: managerId } },
      },
      byProjectName,
    );
  }

  /**
   * An employee's active projects (assigned for the current year). Basic
   * info only, and no ownership filter: employees see every project they
   * are assigned to.
   */
  listMyCurrent(employeeId: number): Promise<EmployeeProjectDto[]> {
    return this.findEmployeeProjects(
      { employeeId, year: currentYear() },
      byProjectName,
    );
  }

  /**
   * An employee's past projects: one row per earlier year they were
   * assigned, newest year first. Future years are intentionally not shown.
   */
  listMyPast(employeeId: number): Promise<EmployeeProjectDto[]> {
    return this.findEmployeeProjects(
      { employeeId, year: { lt: currentYear() } },
      [{ year: 'desc' }, ...byProjectName],
    );
  }

  private async findEmployeeProjects(
    where: Prisma.ProjectAssignmentWhereInput,
    orderBy: Prisma.ProjectAssignmentOrderByWithRelationInput[],
  ): Promise<EmployeeProjectDto[]> {
    const rows = await this.prisma.projectAssignment.findMany({
      where,
      select: {
        year: true,
        projectYear: {
          select: {
            project: { select: { id: true, name: true, description: true } },
          },
        },
      },
      orderBy,
    });
    return rows.map((r) => ({ ...r.projectYear.project, year: r.year }));
  }

  /** Writes are current-year only; past years are read-only history. */
  private assertCurrentYear(requested?: number): number {
    const year = currentYear();
    if (requested !== undefined && requested !== year) {
      throw new ConflictException(
        'Assignments can only be changed for the current year',
      );
    }
    return year;
  }

  private isPrismaError(err: unknown, code: string) {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
    );
  }
}
