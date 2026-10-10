import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { MeResponseDto } from './dto/me-response.dto';

// Valid bcrypt hash compared against when the email is unknown, so response
// time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginDto): Promise<LoginResponseDto> {
    const employee = await this.prisma.employee.findUnique({
      where: { email },
    });
    const passwordOk = await bcrypt.compare(
      password,
      employee?.passwordHash ?? DUMMY_HASH,
    );
    if (!employee || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(employee);
  }

  /** Single place that mints tokens, so a refresh token can be added later. */
  async issueTokens(employee: {
    id: number;
    name: string;
    role: LoginResponseDto['user']['role'];
  }): Promise<LoginResponseDto> {
    const accessToken = await this.jwt.signAsync({
      sub: employee.id,
      role: employee.role,
    });
    return {
      accessToken,
      user: { id: employee.id, name: employee.name, role: employee.role },
    };
  }

  async getMe(id: number): Promise<MeResponseDto> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        managerId: true,
      },
    });
    if (!employee) throw new UnauthorizedException();
    return employee;
  }
}
