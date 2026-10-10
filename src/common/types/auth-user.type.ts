import { Role } from '../../generated/prisma/enums';

export interface AuthUser {
  id: number;
  role: Role;
  managerId: number | null;
}
