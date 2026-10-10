import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  const login = (email: string, password = 'password123') =>
    http().post('/api/auth/login').send({ email, password });

  it('logs in a manager', async () => {
    const res = await login('manager@example.com').expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ role: 'MANAGER' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects a wrong password and unknown email identically', async () => {
    const wrong = await login('manager@example.com', 'nope').expect(401);
    const unknown = await login('nobody@example.com').expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('rejects a malformed body', () => {
    return http().post('/api/auth/login').send({ email: 'x' }).expect(400);
  });

  it('GET /auth/me returns the employee with managerId', async () => {
    const { body } = await login('asha@example.com').expect(200);
    const me = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      email: 'asha@example.com',
      role: 'EMPLOYEE',
      managerId: expect.any(Number),
    });
    expect(me.body.passwordHash).toBeUndefined();
  });

  it('GET /auth/me returns managerId null for a manager', async () => {
    const { body } = await login('manager@example.com').expect(200);
    const me = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(me.body.managerId).toBeNull();
  });

  it('GET /auth/me without a token is 401', () => {
    return http().get('/api/auth/me').expect(401);
  });

  it('GET /auth/me with a tampered token is 401', async () => {
    const { body } = await login('manager@example.com').expect(200);
    return http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}x`)
      .expect(401);
  });
});
