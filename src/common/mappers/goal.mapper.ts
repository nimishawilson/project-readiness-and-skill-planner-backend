import { LearningGoalView } from './goal.entity';

export { LearningGoalView };

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
