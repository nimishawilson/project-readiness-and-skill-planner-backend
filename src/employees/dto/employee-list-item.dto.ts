import { DepartmentDto } from '../../departments/dto/department.dto';
import { Role } from '../../generated/prisma/enums';

export class EmployeeListItemDto {
  id: number;
  name: string;
  email: string;
  department: DepartmentDto | null;
  role: Role;
}
