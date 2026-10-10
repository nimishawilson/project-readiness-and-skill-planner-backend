import { DepartmentDto } from '../../departments/dto/department.dto';
import { LearningGoalView } from '../../common/mappers/goal.mapper';
import { EmployeeSkillView } from '../../common/mappers/skill.mapper';

export class EmployeeProfileDto {
  id: number;
  name: string;
  email: string;
  department: DepartmentDto | null;
  managerId: number | null;
  skills: EmployeeSkillView[];
  /** Current year's goals; other years via the learning-goals endpoint. */
  learningGoals: LearningGoalView[];
}
