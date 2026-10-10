import { Role } from '../../generated/prisma/enums';

export class LoginUserDto {
  id: number;
  name: string;
  role: Role;
}

export class LoginResponseDto {
  accessToken: string;
  user: LoginUserDto;
}
