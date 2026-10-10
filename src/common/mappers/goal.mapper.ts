import { ApprovalStatus, ProgressStatus } from '../../generated/prisma/enums';

export class LearningGoalView {
  id: number;
  employeeId: number;
  title: string;
  description: string | null;
  year: number;
  progressStatus: ProgressStatus;
  approvalStatus: ApprovalStatus;
  createdAt: Date;
}

export const learningGoalSelect = {
  id: true,
  employeeId: true,
  title: true,
  description: true,
  year: true,
  progressStatus: true,
  approvalStatus: true,
  createdAt: true,
} as const;

export function toGoalView(row: LearningGoalView): LearningGoalView {
  return { ...row };
}
