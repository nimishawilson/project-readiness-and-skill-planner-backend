import { ConflictException, Injectable } from '@nestjs/common';
import { currentYear } from '../common/utils/current-year';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectViewDto } from './dto/project-view.dto';
import { ProjectYearSummaryDto } from './dto/project-year-summary.dto';
import { ProjectsService } from './projects.service';

@Injectable()
export class ProjectYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  /**
   * Roll a project forward to a new year: the year must be the current year
   * or later and after the project's latest mapped year. The latest year's
   * assignments are copied to the new year.
   */
  async mapYear(
    managerId: number,
    projectId: number,
    year: number,
  ): Promise<ProjectViewDto> {
    await this.projects.assertOwned(managerId, projectId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockProject(tx, projectId);
        const mapped = (
          await tx.projectYear.findMany({
            where: { projectId },
            select: { year: true },
          })
        ).map((y) => y.year);
        const latest = mapped.length ? Math.max(...mapped) : undefined;
        this.assertMappable(year, mapped, latest);

        await tx.projectYear.create({ data: { projectId, year } });
        if (latest === undefined) return;
        const carried = await tx.projectAssignment.findMany({
          where: { projectId, year: latest },
          select: { employeeId: true },
        });
        if (carried.length) {
          await tx.projectAssignment.createMany({
            data: carried.map(({ employeeId }) => ({
              projectId,
              year,
              employeeId,
            })),
          });
        }
      });
    } catch (err) {
      // Backstop: the lock above already serialises concurrent mappings.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw this.alreadyMapped(year);
      }
      throw err;
    }
    return this.projects.getProjectView(managerId, projectId);
  }

  async listYears(
    managerId: number,
    projectId: number,
  ): Promise<ProjectYearSummaryDto[]> {
    await this.projects.assertOwned(managerId, projectId);
    const rows = await this.prisma.projectYear.findMany({
      where: { projectId },
      select: { year: true, _count: { select: { assignments: true } } },
      orderBy: { year: 'asc' },
    });
    return rows.map((r) => ({
      year: r.year,
      assignedCount: r._count.assignments,
    }));
  }

  private assertMappable(
    year: number,
    mapped: number[],
    latest: number | undefined,
  ) {
    if (mapped.includes(year)) throw this.alreadyMapped(year);
    if (year < currentYear()) {
      throw new ConflictException(
        'Projects can only be mapped to the current year or later',
      );
    }
    if (latest !== undefined && year <= latest) {
      throw new ConflictException(
        `Year must be after the project's latest mapped year (${latest})`,
      );
    }
  }

  private alreadyMapped(year: number) {
    return new ConflictException(`Project is already mapped to ${year}`);
  }

  /** Serialises concurrent year mappings of the same project. */
  private async lockProject(tx: Prisma.TransactionClient, projectId: number) {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
  }
}
