import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { uniqueTag } from './utils/unique-tag';

interface YearRow {
  year: number;
  assignedCount: number;
}
interface AssignedRow {
  employeeId: number;
}
interface ProjectBody {
  id: number;
  years: number[];
  readinessStatus: string;
}

describe('Project year mapping (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tag = uniqueTag();
  const y = new Date().getFullYear();

  let mgrId: number;
  let mgrToken: string;
  let otherMgrToken: string;
  let empToken: string;
  let skillA: number;
  let beginnerId: number;
  let expertId: number;
  let plainId: number;

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
    hash: string,
    managerId?: number,
    role: 'MANAGER' | 'EMPLOYEE' = 'EMPLOYEE',
    level?: 'BEGINNER' | 'EXPERT',
  ) =>
    prisma.employee.create({
      data: {
        name,
        email: `${tag}-${name}@example.com`,
        passwordHash: hash,
        role,
        managerId,
        ...(level && { skills: { create: [{ skillId: skillA, level }] } }),
      },
    });
  const createProject = async (name: string, requirements?: object[]) =>
    (
      await http()
        .post('/api/projects')
        .set(auth(mgrToken))
        .send({ name: `${tag}-${name}`, requirements })
        .expect(201)
    ).body.id as number;
  const assign = (projectId: number, employeeId: number) =>
    http()
      .post(`/api/projects/${projectId}/assignments`)
      .set(auth(mgrToken))
      .send({ employeeId });
  const mapYear = (id: number, body: object, token = mgrToken) =>
    http().post(`/api/projects/${id}/map-year`).set(auth(token)).send(body);
  const years = (id: number, token = mgrToken) =>
    http().get(`/api/projects/${id}/years`).set(auth(token));
  const yearRows = async (id: number) =>
    (await years(id).expect(200)).body as YearRow[];
  const assignedIn = async (id: number, year: number) =>
    (
      (
        await http()
          .get(`/api/projects/${id}/assignments?year=${year}`)
          .set(auth(mgrToken))
          .expect(200)
      ).body as AssignedRow[]
    )
      .map((a) => a.employeeId)
      .sort((a, b) => a - b);
  const sorted = (...n: number[]) => [...n].sort((a, b) => a - b);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash('password123', 4);
    skillA = (await prisma.skill.create({ data: { name: `${tag}-A` } })).id;
    const mgr = await mkEmployee('mgr', hash, undefined, 'MANAGER');
    mgrId = mgr.id;
    await mkEmployee('mgr2', hash, undefined, 'MANAGER');
    beginnerId = (await mkEmployee('beg', hash, mgr.id, 'EMPLOYEE', 'BEGINNER'))
      .id;
    expertId = (await mkEmployee('exp', hash, mgr.id, 'EMPLOYEE', 'EXPERT')).id;
    plainId = (await mkEmployee('plain', hash, mgr.id)).id;
    mgrToken = await login(`${tag}-mgr@example.com`);
    otherMgrToken = await login(`${tag}-mgr2@example.com`);
    empToken = await login(`${tag}-beg@example.com`);
  });

  afterAll(async () => {
    // Projects first: owner FK is RESTRICT; they cascade years/assignments.
    await prisma.project.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employeeSkill.deleteMany({ where: { skillId: skillA } });
    await prisma.skill.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employee.deleteMany({ where: { email: { contains: tag } } });
    await app.close();
  });

  describe('access control and validation', () => {
    let projectId: number;
    beforeAll(async () => {
      projectId = await createProject('access');
    });

    it('requires a token and a manager', async () => {
      await http()
        .post('/api/projects/1/map-year')
        .send({ year: y + 1 })
        .expect(401);
      await http().get('/api/projects/1/years').expect(401);
      await mapYear(projectId, { year: y + 1 }, empToken).expect(403);
      await years(projectId, empToken).expect(403);
    });

    it('is private to the owner and writes nothing for others', async () => {
      await mapYear(projectId, { year: y + 1 }, otherMgrToken).expect(403);
      await years(projectId, otherMgrToken).expect(403);
      expect(await yearRows(projectId)).toEqual([
        { year: y, assignedCount: 0 },
      ]);
    });

    it('404s unknown projects', async () => {
      await mapYear(999999, { year: y + 1 }).expect(404);
      await years(999999).expect(404);
    });

    it('400s a missing, non-integer or out-of-range year', async () => {
      await mapYear(projectId, {}).expect(400);
      await mapYear(projectId, { year: 'abc' }).expect(400);
      await mapYear(projectId, { year: 2026.5 }).expect(400);
      await mapYear(projectId, { year: 1999 }).expect(400);
      await mapYear(projectId, { year: 2101 }).expect(400);
      expect((await yearRows(projectId)).map((r) => r.year)).toEqual([y]);
    });
  });

  describe('carrying assignments forward', () => {
    let projectId: number;

    beforeAll(async () => {
      projectId = await createProject('roll', [
        { skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 2 },
      ]);
      await assign(projectId, beginnerId).expect(201);
      await assign(projectId, expertId).expect(201);
    });

    it('maps to next year: new year, copied assignments, current year untouched', async () => {
      const res = await mapYear(projectId, { year: y + 1 }).expect(200);
      const body = res.body as ProjectBody;
      expect(body).toMatchObject({ id: projectId, years: [y, y + 1] });
      expect(await yearRows(projectId)).toEqual([
        { year: y, assignedCount: 2 },
        { year: y + 1, assignedCount: 2 },
      ]);
      expect(await assignedIn(projectId, y + 1)).toEqual(
        sorted(beginnerId, expertId),
      );
      expect(await assignedIn(projectId, y)).toEqual(
        sorted(beginnerId, expertId),
      );
    });

    it('shows the project under the new year, with the same readiness', async () => {
      const list = await http()
        .get(`/api/projects?q=${tag}-roll&year=${y + 1}`)
        .set(auth(mgrToken))
        .expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({ id: projectId, assignedCount: 2 }),
      ]);
      const now = await http()
        .get(`/api/projects/${projectId}/readiness?year=${y}`)
        .set(auth(mgrToken))
        .expect(200);
      const next = await http()
        .get(`/api/projects/${projectId}/readiness?year=${y + 1}`)
        .set(auth(mgrToken))
        .expect(200);
      expect(next.body.status).toBe('READY');
      expect(next.body.requirements).toEqual(now.body.requirements);
    });

    it('rejects mapping the same year again, and any year not after the latest', async () => {
      await mapYear(projectId, { year: y + 1 }).expect(409);
      await mapYear(projectId, { year: y }).expect(409);
      await mapYear(projectId, { year: y - 1 }).expect(409);
      expect((await yearRows(projectId)).map((r) => r.year)).toEqual([
        y,
        y + 1,
      ]);
    });

    it('copies from the latest mapped year, not an earlier one', async () => {
      await prisma.projectAssignment.delete({
        where: {
          projectId_year_employeeId: {
            projectId,
            year: y + 1,
            employeeId: beginnerId,
          },
        },
      });
      await mapYear(projectId, { year: y + 2 }).expect(200);
      expect(await yearRows(projectId)).toEqual([
        { year: y, assignedCount: 2 },
        { year: y + 1, assignedCount: 1 },
        { year: y + 2, assignedCount: 1 },
      ]);
      expect(await assignedIn(projectId, y + 2)).toEqual([expertId]);
    });

    it('allows skipping years, then blocks mapping into the gap', async () => {
      await mapYear(projectId, { year: y + 5 }).expect(200);
      await mapYear(projectId, { year: y + 4 }).expect(409);
      expect((await yearRows(projectId)).map((r) => r.year)).toEqual([
        y,
        y + 1,
        y + 2,
        y + 5,
      ]);
    });
  });

  describe('older and future-only projects', () => {
    it('rolls a project created last year into the current year and makes it assignable', async () => {
      const old = await prisma.project.create({
        data: {
          name: `${tag}-old`,
          createdById: mgrId,
          years: { create: { year: y - 1 } },
        },
      });
      await prisma.projectAssignment.createMany({
        data: [
          { projectId: old.id, year: y - 1, employeeId: beginnerId },
          { projectId: old.id, year: y - 1, employeeId: expertId },
        ],
      });
      // Not assignable until mapped to the current year (Phase 7 rule).
      await assign(old.id, plainId).expect(409);

      const res = await mapYear(old.id, { year: y }).expect(200);
      expect((res.body as ProjectBody).years).toEqual([y - 1, y]);
      expect(await assignedIn(old.id, y)).toEqual(sorted(beginnerId, expertId));
      await assign(old.id, plainId).expect(201);
      expect(await assignedIn(old.id, y)).toEqual(
        sorted(beginnerId, expertId, plainId),
      );
      // Last year's history is unchanged.
      expect(await assignedIn(old.id, y - 1)).toEqual(
        sorted(beginnerId, expertId),
      );
    });

    it('rejects a past year', async () => {
      const id = await createProject('past');
      await mapYear(id, { year: y - 1 }).expect(409);
      expect((await yearRows(id)).map((r) => r.year)).toEqual([y]);
    });

    it('rejects a year at or before an already-mapped future year', async () => {
      const future = await prisma.project.create({
        data: {
          name: `${tag}-future`,
          createdById: mgrId,
          years: { create: { year: y + 1 } },
        },
      });
      await mapYear(future.id, { year: y }).expect(409);
      await mapYear(future.id, { year: y + 1 }).expect(409);
      await mapYear(future.id, { year: y + 2 }).expect(200);
    });

    it('PATCH reports readiness for the latest mapped year when not mapped to the current one', async () => {
      const p = await prisma.project.create({
        data: {
          name: `${tag}-past-only`,
          createdById: mgrId,
          years: { create: { year: y - 2 } },
          requirements: {
            create: [
              { skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 1 },
            ],
          },
        },
      });
      await prisma.projectAssignment.create({
        data: { projectId: p.id, year: y - 2, employeeId: beginnerId },
      });
      const res = await http()
        .patch(`/api/projects/${p.id}`)
        .set(auth(mgrToken))
        .send({ description: 'still fine' })
        .expect(200);
      expect(res.body).toMatchObject({
        years: [y - 2],
        readinessStatus: 'READY',
      });
    });
  });

  describe('GET /projects/:id/years', () => {
    it('lists a fresh project with a zero count', async () => {
      const id = await createProject('fresh');
      expect(await yearRows(id)).toEqual([{ year: y, assignedCount: 0 }]);
    });

    it('maps an empty project and shows zero counts for every year', async () => {
      const id = await createProject('emptyroll');
      await mapYear(id, { year: y + 1 }).expect(200);
      expect(await yearRows(id)).toEqual([
        { year: y, assignedCount: 0 },
        { year: y + 1, assignedCount: 0 },
      ]);
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of two identical map-year calls win and copies each employee once', async () => {
      const id = await createProject('race');
      await assign(id, beginnerId).expect(201);
      await assign(id, expertId).expect(201);
      const results = await Promise.all([
        mapYear(id, { year: y + 1 }),
        mapYear(id, { year: y + 1 }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await yearRows(id)).toEqual([
        { year: y, assignedCount: 2 },
        { year: y + 1, assignedCount: 2 },
      ]);
    });
  });
});
