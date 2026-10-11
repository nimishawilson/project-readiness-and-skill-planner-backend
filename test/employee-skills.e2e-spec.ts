import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { uniqueTag } from './utils/unique-tag';

describe('Employee skills & skills matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tag = uniqueTag();

  let managerToken: string;
  let ashaToken: string;
  let otherManagerToken: string;
  let ashaId: number;
  let raviId: number;
  let otherReportId: number;
  let angularId: number;
  let sqlId: number;
  let tmpSkillId: number;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = async (email: string) =>
    (
      await http()
        .post('/api/auth/login')
        .send({ email, password: 'password123' })
        .expect(200)
    ).body.accessToken as string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash('password123', 4);
    const otherManager = await prisma.employee.create({
      data: {
        name: 'Other Manager',
        email: `${tag}-mgr2@example.com`,
        passwordHash,
        role: 'MANAGER',
      },
    });
    otherReportId = (
      await prisma.employee.create({
        data: {
          name: 'Other Report',
          email: `${tag}-report@example.com`,
          passwordHash,
          managerId: otherManager.id,
        },
      })
    ).id;
    tmpSkillId = (await prisma.skill.create({ data: { name: `${tag}-skill` } }))
      .id;

    ashaId = (
      await prisma.employee.findUniqueOrThrow({
        where: { email: 'asha@example.com' },
      })
    ).id;
    raviId = (
      await prisma.employee.findUniqueOrThrow({
        where: { email: 'ravi@example.com' },
      })
    ).id;
    angularId = (
      await prisma.skill.findFirstOrThrow({ where: { name: 'Angular' } })
    ).id;
    sqlId = (await prisma.skill.findFirstOrThrow({ where: { name: 'SQL' } }))
      .id;

    managerToken = await login('manager@example.com');
    ashaToken = await login('asha@example.com');
    otherManagerToken = await login(`${tag}-mgr2@example.com`);
  });

  afterAll(async () => {
    await prisma.employeeSkill.deleteMany({ where: { skillId: tmpSkillId } });
    await prisma.skill.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employee.deleteMany({ where: { email: { contains: tag } } });
    await app.close();
  });

  describe('access control', () => {
    it('requires a token', async () => {
      await http().get(`/api/employees/${ashaId}/skills`).expect(401);
      await http().get('/api/skills-matrix').expect(401);
      await http().get('/api/me/skills').expect(401);
    });

    it('forbids employees on manager routes and managers on /me/skills', async () => {
      await http()
        .get(`/api/employees/${ashaId}/skills`)
        .set(auth(ashaToken))
        .expect(403);
      await http()
        .post(`/api/employees/${ashaId}/skills`)
        .set(auth(ashaToken))
        .send({ skillId: sqlId, level: 'BEGINNER' })
        .expect(403);
      await http().get('/api/skills-matrix').set(auth(ashaToken)).expect(403);
      await http().get('/api/me/skills').set(auth(managerToken)).expect(403);
    });

    it("forbids a manager from another manager's employee, and 404s a missing one", async () => {
      await http()
        .get(`/api/employees/${otherReportId}/skills`)
        .set(auth(managerToken))
        .expect(403);
      await http()
        .post(`/api/employees/${otherReportId}/skills`)
        .set(auth(managerToken))
        .send({ skillId: sqlId, level: 'BEGINNER' })
        .expect(403);
      await http()
        .get(`/api/employees/${ashaId}/skills`)
        .set(auth(otherManagerToken))
        .expect(403);
      await http()
        .get('/api/employees/999999/skills')
        .set(auth(managerToken))
        .expect(404);
    });
  });

  describe('employee skills CRUD', () => {
    const base = () => `/api/employees/${raviId}/skills`;

    it('lists existing skills ordered by name', async () => {
      const res = await http()
        .get(`/api/employees/${ashaId}/skills`)
        .set(auth(managerToken))
        .expect(200);
      expect(res.body).toEqual(
        expect.arrayContaining([
          { skillId: angularId, skill: 'Angular', level: 'BEGINNER' },
          expect.objectContaining({ skill: 'TypeScript', level: 'EXPERT' }),
        ]),
      );
      const names: string[] = res.body.map((s: { skill: string }) => s.skill);
      expect(names).toEqual(
        [...names].sort((x, y) =>
          x.localeCompare(y, undefined, { sensitivity: 'base' }),
        ),
      );
    });

    it('validates input', async () => {
      await http()
        .post(base())
        .set(auth(managerToken))
        .send({ skillId: tmpSkillId, level: 'GURU' })
        .expect(400);
      await http()
        .post(base())
        .set(auth(managerToken))
        .send({ level: 'BEGINNER' })
        .expect(400);
      await http()
        .patch(`${base()}/${tmpSkillId}`)
        .set(auth(managerToken))
        .send({ level: 'nope' })
        .expect(400);
    });

    it('404s an unknown skill on add', async () => {
      await http()
        .post(base())
        .set(auth(managerToken))
        .send({ skillId: 999999, level: 'BEGINNER' })
        .expect(404);
    });

    it('adds, rejects duplicates, edits and removes a mapping', async () => {
      const added = await http()
        .post(base())
        .set(auth(managerToken))
        .send({ skillId: tmpSkillId, level: 'BEGINNER' })
        .expect(201);
      expect(added.body).toEqual({
        skillId: tmpSkillId,
        skill: `${tag}-skill`,
        level: 'BEGINNER',
      });

      await http()
        .post(base())
        .set(auth(managerToken))
        .send({ skillId: tmpSkillId, level: 'EXPERT' })
        .expect(409);

      const patched = await http()
        .patch(`${base()}/${tmpSkillId}`)
        .set(auth(managerToken))
        .send({ level: 'EXPERT' })
        .expect(200);
      expect(patched.body.level).toBe('EXPERT');

      await http()
        .delete(`${base()}/${tmpSkillId}`)
        .set(auth(managerToken))
        .expect(204);

      await http()
        .delete(`${base()}/${tmpSkillId}`)
        .set(auth(managerToken))
        .expect(404);
      await http()
        .patch(`${base()}/${tmpSkillId}`)
        .set(auth(managerToken))
        .send({ level: 'EXPERT' })
        .expect(404);
    });
  });

  describe('GET /skills-matrix', () => {
    it('returns the team with all catalog skills', async () => {
      const res = await http()
        .get('/api/skills-matrix')
        .set(auth(managerToken))
        .expect(200);
      const names = res.body.skills.map((s: { name: string }) => s.name);
      expect(names).toEqual(
        expect.arrayContaining(['Angular', 'Java', 'SQL', 'TypeScript']),
      );
      const asha = res.body.employees.find(
        (e: { id: number }) => e.id === ashaId,
      );
      expect(asha.levels[String(angularId)]).toBe('BEGINNER');
      expect(asha.levels[String(sqlId)]).toBeUndefined();
      // Only the caller's own team.
      expect(
        res.body.employees.some((e: { id: number }) => e.id === otherReportId),
      ).toBe(false);
    });

    it('filters columns by one or repeated skillId', async () => {
      const one = await http()
        .get(`/api/skills-matrix?skillId=${angularId}`)
        .set(auth(managerToken))
        .expect(200);
      expect(one.body.skills).toEqual([{ id: angularId, name: 'Angular' }]);
      for (const e of one.body.employees) {
        expect(
          Object.keys(e.levels).every((k) => k === String(angularId)),
        ).toBe(true);
      }

      const two = await http()
        .get(`/api/skills-matrix?skillId=${angularId}&skillId=${sqlId}`)
        .set(auth(managerToken))
        .expect(200);
      expect(two.body.skills.map((s: { id: number }) => s.id).sort()).toEqual(
        [angularId, sqlId].sort(),
      );
    });

    it('filters by department and validates query', async () => {
      const res = await http()
        .get('/api/skills-matrix?departmentId=999999')
        .set(auth(managerToken))
        .expect(200);
      expect(res.body.employees).toEqual([]);
      await http()
        .get('/api/skills-matrix?skillId=abc')
        .set(auth(managerToken))
        .expect(400);
      await http()
        .get('/api/skills-matrix?skillId=999999')
        .set(auth(managerToken))
        .expect(404);
    });
  });

  describe('GET /me/skills', () => {
    it("returns the employee's own skills without ids", async () => {
      const res = await http()
        .get('/api/me/skills')
        .set(auth(ashaToken))
        .expect(200);
      expect(res.body).toEqual(
        expect.arrayContaining([
          { skill: 'Angular', level: 'BEGINNER' },
          { skill: 'TypeScript', level: 'EXPERT' },
        ]),
      );
      for (const row of res.body) expect(row).not.toHaveProperty('skillId');
    });
  });
});
