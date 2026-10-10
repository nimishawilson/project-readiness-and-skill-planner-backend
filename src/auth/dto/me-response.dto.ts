import { Role } from '../../generated/prisma/enums';

export class MeResponseDto {
  id: number;
  name: string;
  email: string;
  role: Role;
  managerId: number | null;
}
