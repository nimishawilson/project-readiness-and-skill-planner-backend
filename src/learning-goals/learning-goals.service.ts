import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeamAccessService } from '../auth/team-access.service';
import {
  LearningGoalView,
  learningGoalSelect,
  toGoalView,
} from '../common/mappers/goal.mapper';
import { currentYear } from '../common/utils/current-year';
import { Prisma } from '../generated/prisma/client';
import { ApprovalStatus, ProgressStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLearningGoalDto } from './dto/create-learning-goal.dto';
import { UpdateLearningGoalDto } from './dto/update-learning-goal.dto';

export const MAX_GOALS_PER_YEAR = 3;

const inOrder = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

/** Employee-allowed progress moves: not started -> in progress -> completed. */
const EMPLOYEE_TRANSITIONS: Record<ProgressStatus, ProgressStatus[]> = {
  [ProgressStatus.NOT_STARTED]: [ProgressStatus.IN_PROGRESS],
  [ProgressStatus.IN_PROGRESS]: [ProgressStatus.COMPLETED],
  [ProgressStatus.COMPLETED]: [],
};

@Injectable()
export class LearningGoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamAccess: TeamAccessService,
  ) {}

  async create(
    managerId: number,
    employeeId: number,
    dto: CreateLearningGoalDto,
  ): Promise<LearningGoalView> {
    await this.teamAccess.assertTeamMember(managerId, employeeId);
    const year = currentYear();
    const goal = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, employeeId);
      await this.assertRoomInYear(tx, employeeId, year);
      return tx.learningGoal.create({
        data: {
          employeeId,
          year,
          title: dto.title,
          description: dto.description,
        },
        select: learningGoalSelect,
      });
    });
    return toGoalView(goal);
  }

  async listForEmployee(
    managerId: number,
    employeeId: number,
    year?: number,
  ): Promise<LearningGoalView[]> {
    await this.teamAccess.assertTeamMember(managerId, employeeId);
    return this.listByYear(employeeId, year);
  }

  listMine(employeeId: number, year?: number): Promise<LearningGoalView[]> {
    return this.listByYear(employeeId, year);
  }

  async update(
    managerId: number,
    goalId: number,
    dto: UpdateLearningGoalDto,
  ): Promise<LearningGoalView> {
    const { title, description, progressStatus } = dto;
    if (
      title === undefined &&
      description === undefined &&
      progressStatus === undefined
    ) {
      throw new BadRequestException('Provide at least one field to update');
    }
    const goal = await this.loadForManager(managerId, goalId);
    if (goal.approvalStatus === ApprovalStatus.APPROVED) {
      throw new ConflictException('Approved goals cannot be edited');
    }
    const leavingCompleted =
      progressStatus !== undefined &&
      goal.progressStatus === ProgressStatus.COMPLETED &&
      progressStatus !== ProgressStatus.COMPLETED;
    const row = await this.prisma.learningGoal.update({
      where: { id: goalId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(progressStatus !== undefined && { progressStatus }),
        ...(leavingCompleted && {
          approvalStatus: ApprovalStatus.PENDING,
          approvedAt: null,
          approvedById: null,
        }),
      },
      select: learningGoalSelect,
    });
    return toGoalView(row);
  }

  async approve(managerId: number, goalId: number): Promise<LearningGoalView> {
    const goal = await this.loadForManager(managerId, goalId);
    if (goal.approvalStatus === ApprovalStatus.APPROVED) {
      throw new ConflictException('Goal is already approved');
    }
    if (goal.progressStatus !== ProgressStatus.COMPLETED) {
      throw new ConflictException('Only completed goals can be approved');
    }
    // Conditional write: a concurrent progress change or approval wins.
    const { count } = await this.prisma.learningGoal.updateMany({
      where: {
        id: goalId,
        progressStatus: ProgressStatus.COMPLETED,
        approvalStatus: ApprovalStatus.PENDING,
      },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: managerId,
      },
    });
    if (count === 0) {
      throw new ConflictException('Goal changed; reload and try again');
    }
    return this.findView(goalId);
  }

  async pendingApproval(managerId: number): Promise<LearningGoalView[]> {
    const rows = await this.prisma.learningGoal.findMany({
      where: {
        progressStatus: ProgressStatus.COMPLETED,
        approvalStatus: ApprovalStatus.PENDING,
        employee: { managerId },
      },
      select: learningGoalSelect,
      orderBy: [...inOrder],
    });
    return rows.map(toGoalView);
  }

  async mapYear(
    managerId: number,
    goalId: number,
    year: number,
  ): Promise<LearningGoalView> {
    const goal = await this.loadForManager(managerId, goalId);
    if (goal.year === year) return toGoalView(goal);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, goal.employeeId);
      await this.assertRoomInYear(tx, goal.employeeId, year, goalId);
      return tx.learningGoal.update({
        where: { id: goalId },
        data: { year },
        select: learningGoalSelect,
      });
    });
    return toGoalView(row);
  }

  async advanceMyProgress(
    employeeId: number,
    goalId: number,
    to: ProgressStatus,
  ): Promise<LearningGoalView> {
    // 404 for another employee's goal too, so existence isn't leaked.
    const goal = await this.prisma.learningGoal.findFirst({
      where: { id: goalId, employeeId },
      select: { progressStatus: true },
    });
    if (!goal) throw new NotFoundException('Learning goal not found');
    if (!EMPLOYEE_TRANSITIONS[goal.progressStatus].includes(to)) {
      throw new ConflictException(
        `Cannot move a goal from ${goal.progressStatus} to ${to}`,
      );
    }
    const { count } = await this.prisma.learningGoal.updateMany({
      where: { id: goalId, employeeId, progressStatus: goal.progressStatus },
      data: { progressStatus: to },
    });
    if (count === 0) {
      throw new ConflictException('Goal changed; reload and try again');
    }
    return this.findView(goalId);
  }

  private async listByYear(
    employeeId: number,
    year?: number,
  ): Promise<LearningGoalView[]> {
    const rows = await this.prisma.learningGoal.findMany({
      where: { employeeId, year: year ?? currentYear() },
      select: learningGoalSelect,
      orderBy: [...inOrder],
    });
    return rows.map(toGoalView);
  }

  /** Loads a goal (404) and checks its owner is on the manager's team. */
  private async loadForManager(managerId: number, goalId: number) {
    const goal = await this.prisma.learningGoal.findUnique({
      where: { id: goalId },
      select: learningGoalSelect,
    });
    if (!goal) throw new NotFoundException('Learning goal not found');
    await this.teamAccess.assertTeamMember(managerId, goal.employeeId);
    return goal;
  }

  private async findView(goalId: number): Promise<LearningGoalView> {
    const row = await this.prisma.learningGoal.findUnique({
      where: { id: goalId },
      select: learningGoalSelect,
    });
    if (!row) throw new NotFoundException('Learning goal not found');
    return toGoalView(row);
  }

  /** Serialises per-employee goal-count changes (the cap has no DB constraint). */
  private async lockEmployee(tx: Prisma.TransactionClient, employeeId: number) {
    await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employeeId} FOR UPDATE`;
  }

  private async assertRoomInYear(
    tx: Prisma.TransactionClient,
    employeeId: number,
    year: number,
    excludeGoalId?: number,
  ) {
    const count = await tx.learningGoal.count({
      where: {
        employeeId,
        year,
        ...(excludeGoalId !== undefined && { id: { not: excludeGoalId } }),
      },
    });
    if (count >= MAX_GOALS_PER_YEAR) {
      throw new ConflictException(
        `Employee already has ${MAX_GOALS_PER_YEAR} learning goals for ${year}`,
      );
    }
  }
}
