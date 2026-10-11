import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';

describe('Learning goals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tag = `e2e${Date.now()}`;
  const year = new Date().getFullYear();

  let mgrToken: string;
  let otherMgrToken: string;
  let empToken: string;
  let empId: number;
  let otherEmpId: number;
  let outsiderId: number;
  let outsiderToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = async (email: string) =>
    (
      await http()
        .post('/api/auth/login')
        .send({ email, password: 'password123' })
        .expect(200)
    ).body.accessToken as string;
  const mkEmployee = (
    name: string,
    passwordHash: string,
    managerId?: number,
    role: 'MANAGER' | 'EMPLOYEE' = 'EMPLOYEE',
  ) =>
    prisma.employee.create({
      data: {
        name,
        email: `${tag}-${name}@example.com`,
        passwordHash,
        role,
        managerId,
      },
    });
  const createGoal = (employeeId: number, title: string, token = mgrToken) =>
    http()
      .post(`/api/employees/${employeeId}/learning-goals`)
      .set(auth(token))
      .send({ title });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash('password123', 4);
    const mgr = await mkEmployee('mgr', hash, undefined, 'MANAGER');
    const otherMgr = await mkEmployee('mgr2', hash, undefined, 'MANAGER');
    empId = (await mkEmployee('emp', hash, mgr.id)).id;
    otherEmpId = (await mkEmployee('emp2', hash, otherMgr.id)).id;
    outsiderId = (await mkEmployee('emp3', hash, mgr.id)).id;
    mgrToken = await login(`${tag}-mgr@example.com`);
    otherMgrToken = await login(`${tag}-mgr2@example.com`);
    empToken = await login(`${tag}-emp@example.com`);
    outsiderToken = await login(`${tag}-emp3@example.com`);
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { email: { contains: tag } } });
    await app.close();
  });

  describe('access control', () => {
    it('requires a token', async () => {
      await http().get(`/api/employees/${empId}/learning-goals`).expect(401);
      await http().get('/api/learning-goals/pending-approval').expect(401);
      await http().get('/api/me/learning-goals').expect(401);
    });

    it('forbids the wrong role', async () => {
      await createGoal(empId, 'x', empToken).expect(403);
      await http()
        .get(`/api/employees/${empId}/learning-goals`)
        .set(auth(empToken))
        .expect(403);
      await http()
        .get('/api/learning-goals/pending-approval')
        .set(auth(empToken))
        .expect(403);
      await http()
        .patch('/api/learning-goals/1')
        .set(auth(empToken))
        .send({ title: 'x' })
        .expect(403);
      await http()
        .post('/api/learning-goals/1/approve')
        .set(auth(empToken))
        .expect(403);
      await http()
        .post('/api/learning-goals/1/map-year')
        .set(auth(empToken))
        .send({ year: 2027 })
        .expect(403);
      await http()
        .get('/api/me/learning-goals')
        .set(auth(mgrToken))
        .expect(403);
      await http()
        .patch('/api/me/learning-goals/1/progress')
        .set(auth(mgrToken))
        .send({ progressStatus: 'IN_PROGRESS' })
        .expect(403);
    });

    it('forbids other teams and 404s unknown ids', async () => {
      await createGoal(otherEmpId, 'x').expect(403);
      await http()
        .get(`/api/employees/${otherEmpId}/learning-goals`)
        .set(auth(mgrToken))
        .expect(403);
      await createGoal(999999, 'x').expect(404);
      await http()
        .patch('/api/learning-goals/999999')
        .set(auth(mgrToken))
        .send({ title: 'x' })
        .expect(404);
      await http()
        .post('/api/learning-goals/999999/approve')
        .set(auth(mgrToken))
        .expect(404);
    });
  });

  describe('validation', () => {
    it('validates create, update, map-year and year queries', async () => {
      await createGoal(empId, '   ').expect(400);
      await createGoal(empId, 'a'.repeat(101)).expect(400);
      await http()
        .post(`/api/employees/${empId}/learning-goals`)
        .set(auth(mgrToken))
        .send({ title: 'ok', description: 'd'.repeat(1001) })
        .expect(400);
      await http()
        .get(`/api/employees/${empId}/learning-goals?year=abc`)
        .set(auth(mgrToken))
        .expect(400);
      await http()
        .get('/api/me/learning-goals?year=1900')
        .set(auth(empToken))
        .expect(400);
    });
  });

  describe('lifecycle', () => {
    let goalId: number;

    it('creates a NOT_STARTED/PENDING goal for the current year', async () => {
      const res = await createGoal(empId, '  Learn   NestJS ').expect(201);
      goalId = res.body.id;
      expect(res.body).toEqual({
        id: expect.any(Number),
        employeeId: empId,
        title: 'Learn NestJS',
        description: null,
        year,
        progressStatus: 'NOT_STARTED',
        approvalStatus: 'PENDING',
        createdAt: expect.any(String),
      });
    });

    it('lists it for manager and employee, and by year', async () => {
      const m = await http()
        .get(`/api/employees/${empId}/learning-goals`)
        .set(auth(mgrToken))
        .expect(200);
      expect(m.body.map((g: { id: number }) => g.id)).toEqual([goalId]);
      const e = await http()
        .get('/api/me/learning-goals')
        .set(auth(empToken))
        .expect(200);
      expect(e.body.map((g: { id: number }) => g.id)).toEqual([goalId]);
      const none = await http()
        .get(`/api/me/learning-goals?year=${year - 1}`)
        .set(auth(empToken))
        .expect(200);
      expect(none.body).toEqual([]);
      const profile = await http()
        .get(`/api/employees/${empId}`)
        .set(auth(mgrToken))
        .expect(200);
      expect(profile.body.learningGoals).toHaveLength(1);
    });

    it('lets the employee advance only forward, one step at a time', async () => {
      const progress = (status: string, token = empToken) =>
        http()
          .patch(`/api/me/learning-goals/${goalId}/progress`)
          .set(auth(token))
          .send({ progressStatus: status });
      await progress('COMPLETED').expect(409); // skips a step
      await progress('NOT_STARTED').expect(409); // same state
      await progress('BOGUS').expect(400);
      await progress('IN_PROGRESS', outsiderToken).expect(404); // not own
      await progress('IN_PROGRESS').expect(200);
      await progress('NOT_STARTED').expect(409); // backwards
      const done = await progress('COMPLETED').expect(200);
      expect(done.body.progressStatus).toBe('COMPLETED');
      expect(done.body.approvalStatus).toBe('PENDING');
      await progress('IN_PROGRESS').expect(409);
    });

    it('shows the completed goal in pending approval for its manager only', async () => {
      const m = await http()
        .get('/api/learning-goals/pending-approval')
        .set(auth(mgrToken))
        .expect(200);
      expect(m.body.map((g: { id: number }) => g.id)).toContain(goalId);
      const o = await http()
        .get('/api/learning-goals/pending-approval')
        .set(auth(otherMgrToken))
        .expect(200);
      expect(o.body.map((g: { id: number }) => g.id)).not.toContain(goalId);
    });

    it('refuses approval from another team, then approves, then locks', async () => {
      await http()
        .post(`/api/learning-goals/${goalId}/approve`)
        .set(auth(otherMgrToken))
        .expect(403);
      const ok = await http()
        .post(`/api/learning-goals/${goalId}/approve`)
        .set(auth(mgrToken))
        .expect(200);
      expect(ok.body.approvalStatus).toBe('APPROVED');
      await http()
        .post(`/api/learning-goals/${goalId}/approve`)
        .set(auth(mgrToken))
        .expect(409);
      await http()
        .patch(`/api/learning-goals/${goalId}`)
        .set(auth(mgrToken))
        .send({ title: 'Changed' })
        .expect(409);
      const pending = await http()
        .get('/api/learning-goals/pending-approval')
        .set(auth(mgrToken))
        .expect(200);
      expect(pending.body.map((g: { id: number }) => g.id)).not.toContain(
        goalId,
      );
    });
  });

  describe('manager updates', () => {
    it('edits, changes progress, rejects empty bodies and unapproved approval', async () => {
      const g = (await createGoal(outsiderId, 'Edit me').expect(201)).body;
      await http()
        .patch(`/api/learning-goals/${g.id}`)
        .set(auth(mgrToken))
        .send({})
        .expect(400);
      await http()
        .post(`/api/learning-goals/${g.id}/approve`)
        .set(auth(mgrToken))
        .expect(409);
      const res = await http()
        .patch(`/api/learning-goals/${g.id}`)
        .set(auth(mgrToken))
        .send({
          title: 'Edited',
          description: ' notes ',
          progressStatus: 'COMPLETED',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'Edited',
        description: 'notes',
        progressStatus: 'COMPLETED',
        approvalStatus: 'PENDING',
      });
      const back = await http()
        .patch(`/api/learning-goals/${g.id}`)
        .set(auth(mgrToken))
        .send({ progressStatus: 'IN_PROGRESS' })
        .expect(200);
      expect(back.body.progressStatus).toBe('IN_PROGRESS');
    });
  });

  describe('limit of 3 per employee per year', () => {
    it('allows exactly 3 under concurrent creates', async () => {
      const target = (
        await mkEmployee(
          'race',
          await bcrypt.hash('x', 4),
          (
            await prisma.employee.findUniqueOrThrow({
              where: { email: `${tag}-mgr@example.com` },
            })
          ).id,
        )
      ).id;
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => createGoal(target, `Race ${i}`)),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 201, 201, 409, 409]);
      const count = await prisma.learningGoal.count({
        where: { employeeId: target, year },
      });
      expect(count).toBe(3);
    });
  });

  describe('POST /learning-goals/:id/map-year', () => {
    it('moves a goal, is a no-op for the same year, and enforces the limit', async () => {
      const target = (
        await mkEmployee(
          'mapper',
          await bcrypt.hash('x', 4),
          (
            await prisma.employee.findUniqueOrThrow({
              where: { email: `${tag}-mgr@example.com` },
            })
          ).id,
        )
      ).id;
      const goals = [] as { id: number }[];
      for (const t of ['A', 'B', 'C'])
        goals.push((await createGoal(target, t).expect(201)).body);
      const next = year + 1;
      const mapYear = (id: number, y: number, token = mgrToken) =>
        http()
          .post(`/api/learning-goals/${id}/map-year`)
          .set(auth(token))
          .send({ year: y });

      await mapYear(goals[0].id, 1999).expect(400);
      await mapYear(goals[0].id, year, otherMgrToken).expect(403);
      await mapYear(goals[0].id, year).expect(200); // no-op

      const moved = await mapYear(goals[0].id, next).expect(200);
      expect(moved.body).toMatchObject({ id: goals[0].id, year: next });
      const cur = await http()
        .get(`/api/employees/${target}/learning-goals`)
        .set(auth(mgrToken));
      expect(cur.body).toHaveLength(2);
      const nxt = await http()
        .get(`/api/employees/${target}/learning-goals?year=${next}`)
        .set(auth(mgrToken));
      expect(nxt.body.map((g: { id: number }) => g.id)).toEqual([goals[0].id]);

      // Fill the target year, then the 4th mapping is rejected.
      await mapYear(goals[1].id, next).expect(200);
      await mapYear(goals[2].id, next).expect(200);
      const extra = (await createGoal(target, 'D').expect(201)).body;
      await mapYear(extra.id, next).expect(409);
    });
  });
});
