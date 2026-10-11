import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { uniqueTag } from './utils/unique-tag';

describe('Departments & Employees (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tag = uniqueTag('e2e-');
  const emailOf = (n: string) => `${tag}-${n}@example.com`;

  let managerToken: string;
  let ashaToken: string;
  let otherManagerToken: string;
  let otherEmployeeId: number;
  let departmentId: number;

  const login = async (email: string, password = 'password123') =>
    (await http().post('/api/auth/login').send({ email, password }).expect(200))
      .body.accessToken as string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    departmentId = (await prisma.department.findFirstOrThrow()).id;

    const passwordHash = await bcrypt.hash('password123', 4);
    const otherManager = await prisma.employee.create({
      data: {
        name: 'Other Manager',
        email: emailOf('mgr2'),
        passwordHash,
        role: 'MANAGER',
      },
    });
    otherEmployeeId = (
      await prisma.employee.create({
        data: {
          name: 'Other Report',
          email: emailOf('report'),
          passwordHash,
          managerId: otherManager.id,
        },
      })
    ).id;

    managerToken = await login('manager@example.com');
    ashaToken = await login('asha@example.com');
    otherManagerToken = await login(emailOf('mgr2'));
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { email: { contains: tag } } });
    await app.close();
  });

  describe('GET /departments', () => {
    it('is available to both roles', async () => {
      for (const token of [managerToken, ashaToken]) {
        const res = await http()
          .get('/api/departments')
          .set(auth(token))
          .expect(200);
        expect(res.body[0]).toEqual({
          id: expect.any(Number),
          name: expect.any(String),
        });
      }
    });

    it('requires a token', () => http().get('/api/departments').expect(401));
  });

  describe('GET /employees', () => {
    it('lists only the caller’s team with pagination metadata', async () => {
      const res = await http()
        .get('/api/employees')
        .set(auth(managerToken))
        .expect(200);
      const emails = res.body.items.map((e: { email: string }) => e.email);
      expect(emails).toEqual(
        expect.arrayContaining(['asha@example.com', 'ravi@example.com']),
      );
      expect(emails).not.toContain('manager@example.com');
      expect(emails).not.toContain(emailOf('report'));
      expect(res.body).toMatchObject({ page: 1, pageSize: 20 });
      expect(res.body.total).toBe(res.body.items.length);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('searches by name/email and filters by department', async () => {
      const res = await http()
        .get('/api/employees?q=ASHA')
        .set(auth(managerToken))
        .expect(200);
      expect(res.body.items.map((e: { email: string }) => e.email)).toEqual([
        'asha@example.com',
      ]);

      const none = await http()
        .get('/api/employees?departmentId=999999')
        .set(auth(managerToken))
        .expect(200);
      expect(none.body.total).toBe(0);
    });

    it('paginates', async () => {
      const res = await http()
        .get('/api/employees?page=1&pageSize=1')
        .set(auth(managerToken))
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });

    it('rejects a bad query', () =>
      http()
        .get('/api/employees?pageSize=1000')
        .set(auth(managerToken))
        .expect(400));

    it('is forbidden for employees', () =>
      http().get('/api/employees').set(auth(ashaToken)).expect(403));
  });

  describe('GET /employees/:id', () => {
    it('returns a team member’s profile', async () => {
      const list = await http()
        .get('/api/employees?q=asha')
        .set(auth(managerToken));
      const id = list.body.items[0].id;
      const res = await http()
        .get(`/api/employees/${id}`)
        .set(auth(managerToken))
        .expect(200);
      expect(res.body).toMatchObject({
        id,
        email: 'asha@example.com',
        skills: expect.any(Array),
        learningGoals: expect.any(Array),
      });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('is 403 for another team’s employee and 404 for unknown', async () => {
      await http()
        .get(`/api/employees/${otherEmployeeId}`)
        .set(auth(managerToken))
        .expect(403);
      await http()
        .get('/api/employees/99999999')
        .set(auth(managerToken))
        .expect(404);
      await http()
        .get('/api/employees/abc')
        .set(auth(managerToken))
        .expect(400);
    });
  });

  describe('POST /employees + PATCH /employees/:id', () => {
    const body = () => ({
      name: 'Created Person',
      email: `  ${emailOf('NEW').toUpperCase()} `,
      password: 'password123',
      departmentId,
    });
    let createdId: number;

    it('creates an employee on the caller’s team who can log in', async () => {
      const res = await http()
        .post('/api/employees')
        .set(auth(managerToken))
        .send({ ...body(), role: 'MANAGER', managerId: 999 })
        .expect(201);
      createdId = res.body.id;
      expect(res.body).toMatchObject({
        email: emailOf('new'),
        role: 'EMPLOYEE',
      });
      const stored = await prisma.employee.findUniqueOrThrow({
        where: { id: createdId },
      });
      expect(stored.managerId).not.toBe(999);
      await login(emailOf('new'));
    });

    it('409s on a duplicate email regardless of case', () =>
      http()
        .post('/api/employees')
        .set(auth(managerToken))
        .send(body())
        .expect(409));

    it('validates the body and department', async () => {
      await http()
        .post('/api/employees')
        .set(auth(managerToken))
        .send({ ...body(), password: 'short' })
        .expect(400);
      await http()
        .post('/api/employees')
        .set(auth(managerToken))
        .send({ ...body(), email: emailOf('x2'), departmentId: 999999 })
        .expect(404);
    });

    it('is forbidden for employees', () =>
      http()
        .post('/api/employees')
        .set(auth(ashaToken))
        .send(body())
        .expect(403));

    it('patches a team member and 409s on a taken email', async () => {
      const res = await http()
        .patch(`/api/employees/${createdId}`)
        .set(auth(managerToken))
        .send({ name: 'Renamed' })
        .expect(200);
      expect(res.body.name).toBe('Renamed');

      await http()
        .patch(`/api/employees/${createdId}`)
        .set(auth(managerToken))
        .send({ email: 'asha@example.com' })
        .expect(409);

      const cleared = await http()
        .patch(`/api/employees/${createdId}`)
        .set(auth(managerToken))
        .send({ departmentId: null })
        .expect(200);
      expect(cleared.body.department).toBeNull();
    });

    it('cannot patch another team’s employee', async () => {
      await http()
        .patch(`/api/employees/${otherEmployeeId}`)
        .set(auth(managerToken))
        .send({ name: 'Hacked' })
        .expect(403);
      await http()
        .patch(`/api/employees/${createdId}`)
        .set(auth(otherManagerToken))
        .send({ name: 'Hacked' })
        .expect(403);
    });
  });

  describe('GET /me/profile', () => {
    it('returns the employee’s own profile with manager and skills', async () => {
      const res = await http()
        .get('/api/me/profile')
        .set(auth(ashaToken))
        .expect(200);
      expect(res.body).toMatchObject({
        email: 'asha@example.com',
        manager: { name: expect.any(String) },
        skills: expect.any(Array),
      });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('is forbidden for managers', () =>
      http().get('/api/me/profile').set(auth(managerToken)).expect(403));
  });
});
