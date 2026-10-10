import { DepartmentDto } from '../../departments/dto/department.dto';

export class ManagerSummaryDto {
  id: number;
  name: string;
}

export class MySkillDto {
  skill: string;
  level: string;
}

export class MyProfileDto {
  id: number;
  name: string;
  email: string;
  department: DepartmentDto | null;
  manager: ManagerSummaryDto | null;
  skills: MySkillDto[];
}
