import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { uniqueTag } from './utils/unique-tag';

interface ProjectRow {
  id: number;
  name: string;
  description: string | null;
  year: number;
}

describe('Employee projects (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tag = uniqueTag();
  const y = new Date().getFullYear();

  let mgrToken: string;
  let empId: number;
  let empToken: string;
  let emptyToken: string;
  let otherEmpId: number;
  let otherMgrId: number;

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
  ) =>
    prisma.employee.create({
      data: {
        name,
        email: `${tag}-${name}@example.com`,
        passwordHash: hash,
        role,
        managerId,
      },
    });
  const mkProject = (
    name: string,
    ownerId: number,
    assignments: [number, number][], // [year, employeeId]
    extraYears: number[] = [],
  ) => {
    const years = [
      ...new Set([...assignments.map(([a]) => a), ...extraYears]),
    ].sort((a, b) => a - b);
    return prisma.project.create({
      data: {
        name: `${tag}-${name}`,
        description: `${name} description`,
        createdById: ownerId,
        years: {
          create: years.map((year) => ({
            year,
            assignments: {
              create: assignments
                .filter(([a]) => a === year)
                .map(([, employeeId]) => ({ employeeId })),
            },
          })),
        },
      },
    });
  };
  const current = async (token = empToken): Promise<ProjectRow[]> =>
    (await http().get('/api/me/projects/current').set(auth(token)).expect(200))
      .body as ProjectRow[];
  const past = async (token = empToken): Promise<ProjectRow[]> =>
    (await http().get('/api/me/projects/past').set(auth(token)).expect(200))
      .body as ProjectRow[];
  const summary = (rows: ProjectRow[]) =>
    rows.map((r) => [r.name.replace(`${tag}-`, ''), r.year]);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash('password123', 4);
    const mgr = await mkEmployee('mgr', hash, undefined, 'MANAGER');
    otherMgrId = (await mkEmployee('mgr2', hash, undefined, 'MANAGER')).id;
    empId = (await mkEmployee('emp', hash, mgr.id)).id;
    otherEmpId = (await mkEmployee('emp2', hash, mgr.id)).id;
    await mkEmployee('empty', hash, mgr.id);

    // Current-year projects.
    await mkProject('alpha', mgr.id, [[y, empId]]);
    await mkProject('bravo', mgr.id, [[y, empId]]);
    // Active this year, and also in the past.
    await mkProject('charlie', mgr.id, [
      [y - 1, empId],
      [y, empId],
    ]);
    // Owned by another manager but assigned to this employee.
    await mkProject('delta', otherMgrId, [[y, empId]]);
    // Past only, across two years.
    await mkProject('echo', mgr.id, [
      [y - 2, empId],
      [y - 1, empId],
    ]);
    // Future only.
    await mkProject('foxtrot', mgr.id, [[y + 1, empId]]);
    // Belongs to someone else.
    await mkProject('others', mgr.id, [
      [y, otherEmpId],
      [y - 1, otherEmpId],
    ]);

    mgrToken = await login(`${tag}-mgr@example.com`);
    empToken = await login(`${tag}-emp@example.com`);
    emptyToken = await login(`${tag}-empty@example.com`);
  });

  afterAll(async () => {
    // Projects first: owner FK is RESTRICT; they cascade years/assignments.
    await prisma.project.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employee.deleteMany({ where: { email: { contains: tag } } });
    await app.close();
  });

  describe('access control', () => {
    it('requires a token', async () => {
      await http().get('/api/me/projects/current').expect(401);
      await http().get('/api/me/projects/past').expect(401);
    });

    it('is employees only', async () => {
      await http()
        .get('/api/me/projects/current')
        .set(auth(mgrToken))
        .expect(403);
      await http().get('/api/me/projects/past').set(auth(mgrToken)).expect(403);
    });
  });

  describe('GET /me/projects/current', () => {
    it('lists this year’s assignments ordered by name, whoever owns the project', async () => {
      expect(summary(await current())).toEqual([
        ['alpha', y],
        ['bravo', y],
        ['charlie', y],
        ['delta', y],
      ]);
    });

    it('returns only basic info', async () => {
      const [first] = await current();
      expect(Object.keys(first).sort()).toEqual([
        'description',
        'id',
        'name',
        'year',
      ]);
      expect(first).toEqual({
        id: expect.any(Number),
        name: `${tag}-alpha`,
        description: 'alpha description',
        year: y,
      });
    });

    it('hides future-year projects and other employees’ projects', async () => {
      const names = (await current()).map((p) => p.name);
      expect(names).not.toContain(`${tag}-foxtrot`);
      expect(names).not.toContain(`${tag}-others`);
      expect(names).not.toContain(`${tag}-echo`);
    });

    it('returns an empty list for an employee with no projects', async () => {
      expect(await current(emptyToken)).toEqual([]);
    });
  });

  describe('GET /me/projects/past', () => {
    it('lists one row per earlier year, newest year first, then by name', async () => {
      expect(summary(await past())).toEqual([
        ['charlie', y - 1],
        ['echo', y - 1],
        ['echo', y - 2],
      ]);
    });

    it('keeps past rows of a project that is still active this year', async () => {
      const rows = await past();
      expect(rows.filter((p) => p.name === `${tag}-charlie`)).toHaveLength(1);
      const active = await current();
      expect(active.map((p) => p.name)).toContain(`${tag}-charlie`);
    });

    it('never includes the current or a future year', async () => {
      for (const row of await past()) expect(row.year).toBeLessThan(y);
      expect((await past()).map((p) => p.name)).not.toContain(`${tag}-foxtrot`);
    });

    it('does not leak other employees’ history and is empty for a new employee', async () => {
      expect((await past()).map((p) => p.name)).not.toContain(`${tag}-others`);
      expect(await past(emptyToken)).toEqual([]);
    });

    it('returns only basic info', async () => {
      const [first] = await past();
      expect(Object.keys(first).sort()).toEqual([
        'description',
        'id',
        'name',
        'year',
      ]);
    });
  });

  describe('reflects manager actions', () => {
    const projectOf = async (name: string) =>
      (
        await http()
          .post('/api/projects')
          .set(auth(mgrToken))
          .send({ name: `${tag}-${name}`, description: 'live' })
          .expect(201)
      ).body.id as number;

    it('shows a newly assigned project and drops an unassigned one', async () => {
      const id = await projectOf('golf');
      expect((await current()).map((p) => p.id)).not.toContain(id);
      await http()
        .post(`/api/projects/${id}/assignments`)
        .set(auth(mgrToken))
        .send({ employeeId: empId })
        .expect(201);
      expect((await current()).map((p) => p.id)).toContain(id);
      await http()
        .delete(`/api/projects/${id}/assignments/${empId}`)
        .set(auth(mgrToken))
        .expect(204);
      expect((await current()).map((p) => p.id)).not.toContain(id);
    });

    it('reflects a project rename', async () => {
      const id = await projectOf('hotel-old');
      await http()
        .post(`/api/projects/${id}/assignments`)
        .set(auth(mgrToken))
        .send({ employeeId: empId })
        .expect(201);
      await http()
        .patch(`/api/projects/${id}`)
        .set(auth(mgrToken))
        .send({ name: `${tag}-india` })
        .expect(200);
      const row = (await current()).find((p) => p.id === id);
      expect(row?.name).toBe(`${tag}-india`);
    });

    it('keeps next year hidden after the manager maps the project forward', async () => {
      const id = await projectOf('juliet');
      await http()
        .post(`/api/projects/${id}/assignments`)
        .set(auth(mgrToken))
        .send({ employeeId: empId })
        .expect(201);
      await http()
        .post(`/api/projects/${id}/map-year`)
        .set(auth(mgrToken))
        .send({ year: y + 1 })
        .expect(200);
      const rows = (await current()).filter((p) => p.id === id);
      expect(rows).toHaveLength(1);
      expect(rows[0].year).toBe(y);
      expect((await past()).map((p) => p.id)).not.toContain(id);
      // The carried-forward assignment exists, it is just not shown yet.
      expect(
        await prisma.projectAssignment.count({
          where: { projectId: id, year: y + 1, employeeId: empId },
        }),
      ).toBe(1);
    });
  });
});
