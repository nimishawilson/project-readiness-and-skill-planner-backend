import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';

interface AssignedBody {
  employeeId: number;
  name: string;
  skills: { skill: string; level: string }[];
}
interface DetailBody {
  readinessStatus: string;
  assignedEmployees: AssignedBody[];
}

describe('Project assignments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tag = `e2e${Date.now()}`;
  const year = new Date().getFullYear();

  let mgrId: number;
  let mgrToken: string;
  let otherMgrToken: string;
  let empToken: string;
  let skillX: number;
  let beginnerId: number;
  let expertId: number;
  let plainId: number;
  let outsiderId: number;
  let projectId: number;

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
    skills?: 'BEGINNER' | 'EXPERT',
  ) =>
    prisma.employee.create({
      data: {
        name,
        email: `${tag}-${name}@example.com`,
        passwordHash: hash,
        role,
        managerId,
        ...(skills && {
          skills: { create: [{ skillId: skillX, level: skills }] },
        }),
      },
    });
  const assign = (
    id: number,
    employeeId: number,
    extra = {},
    token = mgrToken,
  ) =>
    http()
      .post(`/api/projects/${id}/assignments`)
      .set(auth(token))
      .send({ employeeId, ...extra });
  const unassign = (
    id: number,
    employeeId: number,
    qs = '',
    token = mgrToken,
  ) =>
    http()
      .delete(`/api/projects/${id}/assignments/${employeeId}${qs}`)
      .set(auth(token));
  const listAssignments = (id: number, qs = '', token = mgrToken) =>
    http().get(`/api/projects/${id}/assignments${qs}`).set(auth(token));
  const detail = async (id: number): Promise<DetailBody> =>
    (await http().get(`/api/projects/${id}`).set(auth(mgrToken)).expect(200))
      .body as DetailBody;
  const ids = (rows: { employeeId: number }[]) => rows.map((r) => r.employeeId);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash('password123', 4);
    skillX = (await prisma.skill.create({ data: { name: `${tag}-X` } })).id;
    const mgr = await mkEmployee('mgr', hash, undefined, 'MANAGER');
    mgrId = mgr.id;
    const mgr2 = await mkEmployee('mgr2', hash, undefined, 'MANAGER');
    beginnerId = (await mkEmployee('beg', hash, mgr.id, 'EMPLOYEE', 'BEGINNER'))
      .id;
    expertId = (await mkEmployee('exp', hash, mgr.id, 'EMPLOYEE', 'EXPERT')).id;
    plainId = (await mkEmployee('plain', hash, mgr.id)).id;
    outsiderId = (await mkEmployee('outsider', hash, mgr2.id)).id;
    mgrToken = await login(`${tag}-mgr@example.com`);
    otherMgrToken = await login(`${tag}-mgr2@example.com`);
    empToken = await login(`${tag}-beg@example.com`);

    projectId = (
      await http()
        .post('/api/projects')
        .set(auth(mgrToken))
        .send({
          name: `${tag}-main`,
          requirements: [
            { skillId: skillX, minLevel: 'INTERMEDIATE', peopleRequired: 1 },
          ],
        })
        .expect(201)
    ).body.id as number;
  });

  afterAll(async () => {
    // Projects first: owner FK is RESTRICT; they cascade years/assignments.
    await prisma.project.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employeeSkill.deleteMany({ where: { skillId: skillX } });
    await prisma.skill.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employee.deleteMany({ where: { email: { contains: tag } } });
    await app.close();
  });

  describe('access control', () => {
    it('requires a token', async () => {
      await http().get('/api/projects/1/assignments').expect(401);
      await http().post('/api/projects/1/assignments').send({}).expect(401);
      await http().delete('/api/projects/1/assignments/1').expect(401);
      await http().get('/api/employees/1/projects').expect(401);
    });

    it('is managers only', async () => {
      await listAssignments(projectId, '', empToken).expect(403);
      await assign(projectId, beginnerId, {}, empToken).expect(403);
      await unassign(projectId, beginnerId, '', empToken).expect(403);
      await http()
        .get(`/api/employees/${beginnerId}/projects`)
        .set(auth(empToken))
        .expect(403);
    });

    it('forbids a non-owner on every project route, and writes nothing', async () => {
      await listAssignments(projectId, '', otherMgrToken).expect(403);
      await assign(projectId, outsiderId, {}, otherMgrToken).expect(403);
      await unassign(projectId, beginnerId, '', otherMgrToken).expect(403);
      expect(
        await prisma.projectAssignment.count({ where: { projectId } }),
      ).toBe(0);
    });

    it('404s unknown projects', async () => {
      await listAssignments(999999).expect(404);
      await assign(999999, beginnerId).expect(404);
      await unassign(999999, beginnerId).expect(404);
    });
  });

  describe('assign / list / unassign', () => {
    it('starts empty', async () => {
      const res = await listAssignments(projectId).expect(200);
      expect(res.body).toEqual([]);
    });

    it('assigns a team member: 201 with name and skills', async () => {
      const res = await assign(projectId, beginnerId).expect(201);
      expect(res.body).toEqual({
        year,
        employeeId: beginnerId,
        name: 'beg',
        skills: [{ skill: `${tag}-X`, level: 'BEGINNER' }],
      });
    });

    it('rejects duplicates, other-team and unknown employees, bad bodies', async () => {
      await assign(projectId, beginnerId).expect(409);
      await assign(projectId, outsiderId).expect(403);
      await assign(projectId, 999999).expect(404);
      await http()
        .post(`/api/projects/${projectId}/assignments`)
        .set(auth(mgrToken))
        .send({})
        .expect(400);
      await http()
        .post(`/api/projects/${projectId}/assignments`)
        .set(auth(mgrToken))
        .send({ employeeId: 'abc' })
        .expect(400);
      await assign(projectId, plainId, { year: 1900 }).expect(400);
      expect(
        await prisma.projectAssignment.count({ where: { projectId } }),
      ).toBe(1);
    });

    it('shows assignees in the list, project detail and project list', async () => {
      await assign(projectId, plainId, { year }).expect(201);
      const list = await listAssignments(projectId).expect(200);
      expect(ids(list.body as AssignedBody[])).toEqual([beginnerId, plainId]);
      expect((list.body as AssignedBody[])[1].skills).toEqual([]);
      const d = await detail(projectId);
      expect(ids(d.assignedEmployees)).toEqual([beginnerId, plainId]);
      const proj = await http()
        .get(`/api/projects?q=${tag}-main`)
        .set(auth(mgrToken))
        .expect(200);
      expect(proj.body.items[0].assignedCount).toBe(2);
    });

    it('flips readiness as qualified people join and leave', async () => {
      // Requirement: one person with X at INTERMEDIATE or above.
      expect((await detail(projectId)).readinessStatus).toBe('NOT_READY');
      await assign(projectId, expertId).expect(201);
      expect((await detail(projectId)).readinessStatus).toBe('READY');
      await unassign(projectId, expertId).expect(204);
      expect((await detail(projectId)).readinessStatus).toBe('NOT_READY');
    });

    it('404s unassigning someone who is not assigned, and removes the row', async () => {
      await unassign(projectId, expertId).expect(404);
      await unassign(projectId, plainId).expect(204);
      await unassign(projectId, plainId).expect(404);
      const list = await listAssignments(projectId).expect(200);
      expect(ids(list.body as AssignedBody[])).toEqual([beginnerId]);
    });

    it('keeps the unassign endpoint usable for an employee who left the team', async () => {
      await prisma.employee.update({
        where: { id: beginnerId },
        data: { managerId: null },
      });
      await unassign(projectId, beginnerId).expect(204);
      await prisma.employee.update({
        where: { id: beginnerId },
        data: { managerId: mgrId },
      });
    });
  });

  describe('current-year rule', () => {
    it('409s a past or future year on assign and unassign', async () => {
      await assign(projectId, plainId, { year: year - 1 }).expect(409);
      await assign(projectId, plainId, { year: year + 1 }).expect(409);
      await unassign(projectId, plainId, `?year=${year - 1}`).expect(409);
      await unassign(projectId, plainId, `?year=${year + 1}`).expect(409);
      await unassign(projectId, plainId, '?year=1900').expect(400);
      expect(
        await prisma.projectAssignment.count({ where: { projectId } }),
      ).toBe(0);
    });

    it('cannot assign a project mapped only to past years, but can read its history', async () => {
      const past = await prisma.project.create({
        data: {
          name: `${tag}-past-only`,
          createdById: mgrId,
          years: { create: { year: year - 1 } },
        },
      });
      await prisma.projectAssignment.create({
        data: { projectId: past.id, year: year - 1, employeeId: beginnerId },
      });
      await assign(past.id, plainId).expect(409);
      await assign(past.id, plainId, { year: year - 1 }).expect(409);
      // No current-year mapping: default falls back to the latest mapped year.
      const fallback = await listAssignments(past.id).expect(200);
      expect(ids(fallback.body as AssignedBody[])).toEqual([beginnerId]);
      const explicit = await listAssignments(
        past.id,
        `?year=${year - 1}`,
      ).expect(200);
      expect(ids(explicit.body as AssignedBody[])).toEqual([beginnerId]);
      await listAssignments(past.id, `?year=${year}`).expect(404);
      // History is read-only.
      await unassign(past.id, beginnerId, `?year=${year - 1}`).expect(409);
      await unassign(past.id, beginnerId).expect(404);
    });

    it('can assign a project created last year once it is mapped to the current year', async () => {
      const carried = await prisma.project.create({
        data: {
          name: `${tag}-carried`,
          createdById: mgrId,
          years: { create: [{ year: year - 1 }, { year }] },
        },
      });
      await assign(carried.id, plainId).expect(201);
      const current = await listAssignments(carried.id).expect(200);
      expect(ids(current.body as AssignedBody[])).toEqual([plainId]);
      const history = await listAssignments(
        carried.id,
        `?year=${year - 1}`,
      ).expect(200);
      expect(history.body).toEqual([]);
    });
  });

  describe('GET /employees/:id/projects', () => {
    let otherProjectId: number;
    let pastProjectId: number;
    let betaId: number;

    beforeAll(async () => {
      betaId = (
        await http()
          .post('/api/projects')
          .set(auth(mgrToken))
          .send({ name: `${tag}-alpha-list` })
          .expect(201)
      ).body.id as number;
      await http()
        .post('/api/projects')
        .set(auth(mgrToken))
        .send({ name: `${tag}-zeta-list` })
        .expect(201);
      await assign(betaId, expertId).expect(201);
      const zeta = await prisma.project.findFirstOrThrow({
        where: { name: `${tag}-zeta-list` },
      });
      await assign(zeta.id, expertId).expect(201);

      // Another manager's project the same employee is attached to.
      otherProjectId = (
        await http()
          .post('/api/projects')
          .set(auth(otherMgrToken))
          .send({ name: `${tag}-foreign-list` })
          .expect(201)
      ).body.id as number;
      await prisma.projectAssignment.create({
        data: { projectId: otherProjectId, year, employeeId: expertId },
      });

      pastProjectId = (
        await prisma.project.create({
          data: {
            name: `${tag}-history-list`,
            createdById: mgrId,
            years: { create: { year: year - 1 } },
          },
        })
      ).id;
      await prisma.projectAssignment.create({
        data: {
          projectId: pastProjectId,
          year: year - 1,
          employeeId: expertId,
        },
      });
    });

    const projectsOf = (employeeId: number, qs = '', token = mgrToken) =>
      http().get(`/api/employees/${employeeId}/projects${qs}`).set(auth(token));

    it('lists current-year projects by default, ordered by name, own projects only', async () => {
      const res = await projectsOf(expertId).expect(200);
      expect(
        (res.body as { name: string; year: number }[]).map((p) => [
          p.name,
          p.year,
        ]),
      ).toEqual([
        [`${tag}-alpha-list`, year],
        [`${tag}-zeta-list`, year],
      ]);
      expect((res.body as { id: number }[]).map((p) => p.id)).not.toContain(
        otherProjectId,
      );
      expect(res.body[0]).toEqual({
        id: betaId,
        name: `${tag}-alpha-list`,
        description: null,
        year,
      });
    });

    it('shows another year with ?year=', async () => {
      const res = await projectsOf(expertId, `?year=${year - 1}`).expect(200);
      expect((res.body as { id: number }[]).map((p) => p.id)).toEqual([
        pastProjectId,
      ]);
      const none = await projectsOf(expertId, `?year=${year - 5}`).expect(200);
      expect(none.body).toEqual([]);
    });

    it('returns an empty list for an unassigned employee', async () => {
      const res = await projectsOf(plainId).expect(200);
      const names = (res.body as { name: string }[]).map((p) => p.name);
      expect(names).not.toContain(`${tag}-alpha-list`);
    });

    it('403s another team’s employee, 404s unknown, 400s a bad year', async () => {
      await projectsOf(outsiderId).expect(403);
      await projectsOf(999999).expect(404);
      await projectsOf(expertId, '?year=abc').expect(400);
    });
  });
});
