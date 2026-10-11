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
