import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

const ctx = (user?: { role: string }) =>
  ({
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);

  it('allows any role when no @Roles metadata', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(ctx({ role: 'EMPLOYEE' }))).toBe(true);
  });

  it('allows a matching role', () => {
    getAllAndOverride.mockReturnValue(['MANAGER']);
    expect(guard.canActivate(ctx({ role: 'MANAGER' }))).toBe(true);
  });

  it('forbids a non-matching role', () => {
    getAllAndOverride.mockReturnValue(['MANAGER']);
    expect(() => guard.canActivate(ctx({ role: 'EMPLOYEE' }))).toThrow(
      ForbiddenException,
    );
  });
});
