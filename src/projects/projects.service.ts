import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { employeeSkillSelect } from '../common/mappers/skill.mapper';
import { Paginated, skipTake, toPage } from '../common/pagination/paginate';
import { currentYear } from '../common/utils/current-year';
import { Prisma } from '../generated/prisma/client';
import { ProficiencyLevel } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import { AddRequirementDto } from './dto/add-requirement.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import {
  ProjectDetailDto,
  ProjectListItemDto,
  ProjectViewDto,
  RequirementDto,
} from './dto/project-view.dto';
import { ProjectReadinessDto } from './dto/project-readiness.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';
import { resolveProjectYear } from './project-year';
import { computeReadiness, Readiness } from './readiness';

const requirementSelect = {
  id: true,
  skillId: true,
  minLevel: true,
  peopleRequired: true,
  skill: { select: { name: true } },
} as const;

const projectSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  createdById: true,
  years: { select: { year: true }, orderBy: { year: 'asc' } },
  requirements: { select: requirementSelect, orderBy: { id: 'asc' } },
} as const;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;
type RequirementRow = Prisma.ProjectRequirementGetPayload<{
  select: typeof requirementSelect;
}>;
export interface Assignee {
  employeeId: number;
  name: string;
  skills: {
    skillId: number;
    level: ProficiencyLevel;
    skill: { name: string };
  }[];
}

const assigneeSelect = {
  projectId: true,
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
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skills: SkillsService,
  ) {}

  /**
   * Projects are private to their creator: 404 if missing, 403 if owned by
   * another manager. Use before any project-scoped read or write. Returns
   * the years the project is mapped to (ascending).
   */
  async assertOwned(
    managerId: number,
    projectId: number,
  ): Promise<{ years: number[] }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        createdById: true,
        years: { select: { year: true }, orderBy: { year: 'asc' } },
      },
    });
    const owned = this.checkOwner(project, managerId);
    return { years: owned.years.map((y) => y.year) };
  }

  async create(
    managerId: number,
    dto: CreateProjectDto,
  ): Promise<ProjectViewDto> {
    const requirements = dto.requirements ?? [];
    const pairs = new Set(
      requirements.map((r) => `${r.skillId}:${r.minLevel}`),
    );
    if (pairs.size !== requirements.length) {
      throw new BadRequestException(
        'Duplicate skill and minimum level in requirements',
      );
    }
    for (const skillId of new Set(requirements.map((r) => r.skillId))) {
      await this.skills.assertExists(skillId);
    }
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        createdById: managerId,
        years: { create: { year: currentYear() } },
        requirements: { create: requirements },
      },
      select: projectSelect,
    });
    const [item] = await this.toItems([project], currentYear());
    return this.toView(item.project, item.readiness);
  }

  async list(
    managerId: number,
    query: ListProjectsQueryDto,
  ): Promise<Paginated<ProjectListItemDto>> {
    const year = query.year ?? currentYear();
    const where: Prisma.ProjectWhereInput = {
      createdById: managerId,
      years: { some: { year } },
    };
    const q = query.q?.trim();
    if (q) where.name = { contains: q, mode: 'insensitive' };
    const orderBy = [{ name: 'asc' }, { id: 'asc' }] as const;

    if (!query.readiness) {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.project.findMany({
          where,
          select: projectSelect,
          orderBy: [...orderBy],
          ...skipTake(query),
        }),
        this.prisma.project.count({ where }),
      ]);
      const items = await this.toItems(rows, year);
      return toPage(
        items.map((i) => this.toListItem(i)),
        total,
        query,
      );
    }

    // Readiness is computed, so filter first and page afterwards.
    const rows = await this.prisma.project.findMany({
      where,
      select: projectSelect,
      orderBy: [...orderBy],
    });
    const matching = (await this.toItems(rows, year)).filter(
      (i) => i.readiness.status === query.readiness,
    );
    const { skip, take } = skipTake(query);
    return toPage(
      matching.slice(skip, skip + take).map((i) => this.toListItem(i)),
      matching.length,
      query,
    );
  }

  async get(
    managerId: number,
    projectId: number,
    requestedYear?: number,
  ): Promise<ProjectDetailDto> {
    const project = await this.loadOwned(managerId, projectId);
    const { year, assignees, readiness } = await this.readinessFor(
      project,
      requestedYear,
    );
    return {
      ...this.toView(project, readiness),
      year,
      assignedEmployees: assignees.map((a) => ({
        employeeId: a.employeeId,
        name: a.name,
        skills: a.skills.map((s) => ({ skill: s.skill.name, level: s.level })),
      })),
      requirements: readiness.requirements,
    };
  }

  /** Readiness is computed on read, never stored. */
  async getReadiness(
    managerId: number,
    projectId: number,
    requestedYear?: number,
  ): Promise<ProjectReadinessDto> {
    const project = await this.loadOwned(managerId, projectId);
    const { year, readiness } = await this.readinessFor(project, requestedYear);
    return {
      projectId,
      year,
      status: readiness.status,
      requirements: readiness.requirements,
    };
  }

  async update(
    managerId: number,
    projectId: number,
    dto: UpdateProjectDto,
  ): Promise<ProjectViewDto> {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException('Provide at least one field to update');
    }
    await this.assertOwned(managerId, projectId);
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      select: projectSelect,
    });
    const { readiness } = await this.readinessFor(project);
    return this.toView(project, readiness);
  }

  /** The project shape, with readiness for its default year. */
  async getProjectView(
    managerId: number,
    projectId: number,
  ): Promise<ProjectViewDto> {
    const project = await this.loadOwned(managerId, projectId);
    const { readiness } = await this.readinessFor(project);
    return this.toView(project, readiness);
  }

  async addRequirement(
    managerId: number,
    projectId: number,
    dto: AddRequirementDto,
  ): Promise<RequirementDto> {
    await this.assertOwned(managerId, projectId);
    await this.skills.assertExists(dto.skillId);
    try {
      const row = await this.prisma.projectRequirement.create({
        data: { projectId, ...dto },
        select: requirementSelect,
      });
      return this.toRequirement(row);
    } catch (err) {
      this.rethrowDuplicateRequirement(err);
      throw err;
    }
  }

  async updateRequirement(
    managerId: number,
    projectId: number,
    requirementId: number,
    dto: UpdateRequirementDto,
  ): Promise<RequirementDto> {
    if (dto.minLevel === undefined && dto.peopleRequired === undefined) {
      throw new BadRequestException('Provide at least one field to update');
    }
    await this.assertOwned(managerId, projectId);
    try {
      // Scoped by project so another project's requirement is a 404.
      const { count } = await this.prisma.projectRequirement.updateMany({
        where: { id: requirementId, projectId },
        data: {
          ...(dto.minLevel !== undefined && { minLevel: dto.minLevel }),
          ...(dto.peopleRequired !== undefined && {
            peopleRequired: dto.peopleRequired,
          }),
        },
      });
      if (count === 0) throw this.requirementNotFound();
    } catch (err) {
      this.rethrowDuplicateRequirement(err);
      throw err;
    }
    const row = await this.prisma.projectRequirement.findFirst({
      where: { id: requirementId, projectId },
      select: requirementSelect,
    });
    if (!row) throw this.requirementNotFound();
    return this.toRequirement(row);
  }

  async removeRequirement(
    managerId: number,
    projectId: number,
    requirementId: number,
  ): Promise<void> {
    await this.assertOwned(managerId, projectId);
    const { count } = await this.prisma.projectRequirement.deleteMany({
      where: { id: requirementId, projectId },
    });
    if (count === 0) throw this.requirementNotFound();
  }

  /** Resolves the year, loads its assignees and evaluates the requirements. */
  private async readinessFor(project: ProjectRow, requestedYear?: number) {
    const year = resolveProjectYear(
      project.years.map((y) => y.year),
      requestedYear,
    );
    const assignees =
      (await this.loadAssignees([project.id], year)).get(project.id) ?? [];
    return {
      year,
      assignees,
      readiness: computeReadiness(project.requirements, assignees),
    };
  }

  private async loadOwned(managerId: number, projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: projectSelect,
    });
    return this.checkOwner(project, managerId);
  }

  private checkOwner<T extends { createdById: number }>(
    project: T | null,
    managerId: number,
  ): T {
    if (!project) throw new NotFoundException('Project not found');
    if (project.createdById !== managerId) {
      throw new ForbiddenException('Project is owned by another manager');
    }
    return project;
  }

  /** Assignees (with their skill levels) per project for one year. */
  async loadAssignees(projectIds: number[], year: number) {
    const rows = await this.prisma.projectAssignment.findMany({
      where: { projectId: { in: projectIds }, year },
      select: assigneeSelect,
    });
    const byProject = new Map<number, Assignee[]>();
    for (const row of rows) {
      const list = byProject.get(row.projectId) ?? [];
      list.push({
        employeeId: row.employee.id,
        name: row.employee.name,
        skills: row.employee.skills,
      });
      byProject.set(row.projectId, list);
    }
    for (const list of byProject.values()) {
      list.sort(
        (a, b) => a.name.localeCompare(b.name) || a.employeeId - b.employeeId,
      );
    }
    return byProject;
  }

  private async toItems(projects: ProjectRow[], year: number) {
    const assignees = projects.length
      ? await this.loadAssignees(
          projects.map((p) => p.id),
          year,
        )
      : new Map<number, Assignee[]>();
    return projects.map((project) => {
      const list = assignees.get(project.id) ?? [];
      return {
        project,
        assignedCount: list.length,
        readiness: computeReadiness(project.requirements, list),
      };
    });
  }

  private toView(project: ProjectRow, readiness: Readiness): ProjectViewDto {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      createdYear: project.createdAt.getFullYear(),
      years: project.years.map((y) => y.year),
      readinessStatus: readiness.status,
    };
  }

  private toListItem(item: {
    project: ProjectRow;
    assignedCount: number;
    readiness: Readiness;
  }): ProjectListItemDto {
    return {
      ...this.toView(item.project, item.readiness),
      assignedCount: item.assignedCount,
    };
  }

  private toRequirement(row: RequirementRow): RequirementDto {
    return {
      id: row.id,
      skillId: row.skillId,
      skill: row.skill.name,
      minLevel: row.minLevel,
      peopleRequired: row.peopleRequired,
    };
  }

  private requirementNotFound() {
    return new NotFoundException('Requirement not found in this project');
  }

  private rethrowDuplicateRequirement(err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(
        'A requirement for this skill and level already exists; update it instead',
      );
    }
  }
}
