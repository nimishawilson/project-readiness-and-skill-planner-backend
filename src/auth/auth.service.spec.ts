import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const employee = {
    id: 5,
    name: 'Asha',
    email: 'asha@example.com',
    role: 'EMPLOYEE' as const,
    passwordHash: bcrypt.hashSync('password123', 4),
  };
  const findUnique = jest.fn();
  const signAsync = jest.fn().mockResolvedValue('signed-token');
  const service = new AuthService(
    { employee: { findUnique } } as never,
    { signAsync } as unknown as JwtService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns a token and user on valid credentials', async () => {
    findUnique.mockResolvedValue(employee);
    await expect(
      service.login({ email: employee.email, password: 'password123' }),
    ).resolves.toEqual({
      accessToken: 'signed-token',
      user: { id: 5, name: 'Asha', role: 'EMPLOYEE' },
    });
    expect(signAsync).toHaveBeenCalledWith({ sub: 5, role: 'EMPLOYEE' });
  });

  it('rejects a wrong password', async () => {
    findUnique.mockResolvedValue(employee);
    await expect(
      service.login({ email: employee.email, password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown email', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.login({ email: 'x@y.com', password: 'password123' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(signAsync).not.toHaveBeenCalled();
  });
});
