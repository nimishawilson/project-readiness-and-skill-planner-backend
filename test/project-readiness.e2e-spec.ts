import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { uniqueTag } from './utils/unique-tag';

interface RequirementBody {
  requirementId: number;
  skillId: number;
  skill: string;
  minLevel: string;
  required: number;
  qualifiedAssigned: number;
  additionalNeeded: number;
}
interface ReadinessBody {
  projectId: number;
  year: number;
  status: string;
  requirements: RequirementBody[];
}
type Level = 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';

describe('Project readiness (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tag = uniqueTag();
  const year = new Date().getFullYear();

  let mgrId: number;
  let mgrToken: string;
  let otherMgrToken: string;
  let empToken: string;
  let skillA: number;
  let skillB: number;
  let beginnerId: number; // A BEGINNER
  let expertId: number; // A EXPERT, B INTERMEDIATE
  let interId: number; // A INTERMEDIATE
  let noneId: number; // no skills

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
    skills: [number, Level][] = [],
  ) =>
    prisma.employee.create({
      data: {
        name,
        email: `${tag}-${name}@example.com`,
        passwordHash: hash,
        role,
        managerId,
        skills: {
          create: skills.map(([skillId, level]) => ({ skillId, level })),
        },
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
      .send({ employeeId })
      .expect(201);
  const unassign = (projectId: number, employeeId: number) =>
    http()
      .delete(`/api/projects/${projectId}/assignments/${employeeId}`)
      .set(auth(mgrToken))
      .expect(204);
  const readiness = (projectId: number, qs = '', token = mgrToken) =>
    http().get(`/api/projects/${projectId}/readiness${qs}`).set(auth(token));
  const readinessBody = async (projectId: number, qs = '') =>
    (await readiness(projectId, qs).expect(200)).body as ReadinessBody;
  const req = (skillId: number, minLevel: Level, peopleRequired: number) => ({
    skillId,
    minLevel,
    peopleRequired,
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash('password123', 4);
    skillA = (await prisma.skill.create({ data: { name: `${tag}-A` } })).id;
    skillB = (await prisma.skill.create({ data: { name: `${tag}-B` } })).id;
    const mgr = await mkEmployee('mgr', hash, undefined, 'MANAGER');
    mgrId = mgr.id;
    await mkEmployee('mgr2', hash, undefined, 'MANAGER');
    beginnerId = (
      await mkEmployee('beg', hash, mgr.id, 'EMPLOYEE', [[skillA, 'BEGINNER']])
    ).id;
    expertId = (
      await mkEmployee('exp', hash, mgr.id, 'EMPLOYEE', [
        [skillA, 'EXPERT'],
        [skillB, 'INTERMEDIATE'],
      ])
    ).id;
    interId = (
      await mkEmployee('inter', hash, mgr.id, 'EMPLOYEE', [
        [skillA, 'INTERMEDIATE'],
      ])
    ).id;
    noneId = (await mkEmployee('none', hash, mgr.id)).id;
    mgrToken = await login(`${tag}-mgr@example.com`);
    otherMgrToken = await login(`${tag}-mgr2@example.com`);
    empToken = await login(`${tag}-beg@example.com`);
  });

  afterAll(async () => {
    // Projects first: owner FK is RESTRICT; they cascade years/assignments.
    await prisma.project.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employeeSkill.deleteMany({
      where: { skill: { name: { startsWith: tag } } },
    });
    await prisma.skill.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employee.deleteMany({ where: { email: { contains: tag } } });
    await app.close();
  });

  describe('access control', () => {
    let projectId: number;
    beforeAll(async () => {
      projectId = await createProject('access', [req(skillA, 'BEGINNER', 1)]);
    });

    it('requires a token and a manager', async () => {
      await http().get(`/api/projects/${projectId}/readiness`).expect(401);
      await readiness(projectId, '', empToken).expect(403);
    });

    it('is private to the owner; 404 for unknown projects', async () => {
      await readiness(projectId, '', otherMgrToken).expect(403);
      await readiness(999999).expect(404);
      await readiness(projectId).expect(200);
    });
  });

  describe('readiness calculation', () => {
    it('matches the spec example: A beginner x2 (1 qualified), B intermediate x1 (met)', async () => {
      const id = await createProject('spec', [
        req(skillA, 'BEGINNER', 2),
        req(skillB, 'INTERMEDIATE', 1),
      ]);
      // Expert counts for A (>= BEGINNER) and B; the skill-less person for neither.
      await assign(id, expertId);
      await assign(id, noneId);
      const body = await readinessBody(id);
      expect(body).toMatchObject({ projectId: id, year, status: 'NOT_READY' });
      expect(body.requirements).toEqual([
        {
          requirementId: expect.any(Number),
          skillId: skillA,
          skill: `${tag}-A`,
          minLevel: 'BEGINNER',
          required: 2,
          qualifiedAssigned: 1,
          additionalNeeded: 1,
        },
        {
          requirementId: expect.any(Number),
          skillId: skillB,
          skill: `${tag}-B`,
          minLevel: 'INTERMEDIATE',
          required: 1,
          qualifiedAssigned: 1,
          additionalNeeded: 0,
        },
      ]);
    });

    it('flips to READY when a qualified person joins and back when they leave', async () => {
      const id = await createProject('flip', [req(skillA, 'BEGINNER', 2)]);
      await assign(id, expertId);
      expect((await readinessBody(id)).status).toBe('NOT_READY');
      await assign(id, beginnerId);
      const ready = await readinessBody(id);
      expect(ready.status).toBe('READY');
      expect(ready.requirements[0]).toMatchObject({
        qualifiedAssigned: 2,
        additionalNeeded: 0,
      });
      await unassign(id, beginnerId);
      expect((await readinessBody(id)).status).toBe('NOT_READY');
    });

    it('ignores assigned people without the skill', async () => {
      const id = await createProject('noskill', [req(skillA, 'BEGINNER', 1)]);
      await assign(id, noneId);
      const body = await readinessBody(id);
      expect(body.requirements[0]).toMatchObject({
        qualifiedAssigned: 0,
        additionalNeeded: 1,
      });
      expect(body.status).toBe('NOT_READY');
    });

    it('counts a higher level toward a lower requirement but not the reverse', async () => {
      const low = await createProject('low', [req(skillA, 'BEGINNER', 1)]);
      const high = await createProject('high', [req(skillA, 'EXPERT', 1)]);
      await assign(low, expertId);
      await assign(high, beginnerId);
      expect((await readinessBody(low)).status).toBe('READY');
      expect((await readinessBody(high)).status).toBe('NOT_READY');
      await assign(high, interId);
      expect(
        (await readinessBody(high)).requirements[0].qualifiedAssigned,
      ).toBe(0);
      await assign(high, expertId);
      expect((await readinessBody(high)).status).toBe('READY');
    });

    it('floors additionalNeeded at zero when over-staffed', async () => {
      const id = await createProject('over', [req(skillA, 'BEGINNER', 1)]);
      await assign(id, beginnerId);
      await assign(id, interId);
      await assign(id, expertId);
      const body = await readinessBody(id);
      expect(body.requirements[0]).toMatchObject({
        required: 1,
        qualifiedAssigned: 3,
        additionalNeeded: 0,
      });
      expect(body.status).toBe('READY');
    });

    it('counts one person toward several rows of the same skill', async () => {
      const id = await createProject('twolevels', [
        req(skillA, 'BEGINNER', 1),
        req(skillA, 'EXPERT', 1),
      ]);
      await assign(id, expertId);
      const body = await readinessBody(id);
      expect(body.requirements.map((r) => r.qualifiedAssigned)).toEqual([1, 1]);
      expect(body.status).toBe('READY');
    });

    it('is READY with an empty list when the project has no requirements', async () => {
      const id = await createProject('empty');
      expect(await readinessBody(id)).toEqual({
        projectId: id,
        year,
        status: 'READY',
        requirements: [],
      });
    });

    it('reflects employee skill edits immediately', async () => {
      const id = await createProject('edits', [req(skillA, 'INTERMEDIATE', 1)]);
      await assign(id, interId);
      expect((await readinessBody(id)).status).toBe('READY');
      await http()
        .patch(`/api/employees/${interId}/skills/${skillA}`)
        .set(auth(mgrToken))
        .send({ level: 'BEGINNER' })
        .expect(200);
      const down = await readinessBody(id);
      expect(down.status).toBe('NOT_READY');
      expect(down.requirements[0].qualifiedAssigned).toBe(0);
      await http()
        .patch(`/api/employees/${interId}/skills/${skillA}`)
        .set(auth(mgrToken))
        .send({ level: 'EXPERT' })
        .expect(200);
      expect((await readinessBody(id)).status).toBe('READY');
      await http()
        .delete(`/api/employees/${interId}/skills/${skillA}`)
        .set(auth(mgrToken))
        .expect(204);
      expect((await readinessBody(id)).status).toBe('NOT_READY');
      await http()
        .post(`/api/employees/${interId}/skills`)
        .set(auth(mgrToken))
        .send({ skillId: skillA, level: 'INTERMEDIATE' })
        .expect(201);
    });

    it('reflects requirement edits immediately', async () => {
      const id = await createProject('reqedits', [req(skillA, 'BEGINNER', 1)]);
      await assign(id, beginnerId);
      expect((await readinessBody(id)).status).toBe('READY');
      const first = (await readinessBody(id)).requirements[0].requirementId;
      await http()
        .patch(`/api/projects/${id}/requirements/${first}`)
        .set(auth(mgrToken))
        .send({ peopleRequired: 3 })
        .expect(200);
      expect((await readinessBody(id)).requirements[0]).toMatchObject({
        required: 3,
        additionalNeeded: 2,
      });
      await http()
        .delete(`/api/projects/${id}/requirements/${first}`)
        .set(auth(mgrToken))
        .expect(204);
      expect((await readinessBody(id)).status).toBe('READY');
    });

    it('agrees with the project detail and project list', async () => {
      const id = await createProject('agree', [req(skillA, 'EXPERT', 1)]);
      await assign(id, beginnerId);
      const status = (await readinessBody(id)).status;
      const detail = await http()
        .get(`/api/projects/${id}`)
        .set(auth(mgrToken))
        .expect(200);
      expect(detail.body.readinessStatus).toBe(status);
      const list = await http()
        .get(`/api/projects?q=${tag}-agree`)
        .set(auth(mgrToken))
        .expect(200);
      expect(list.body.items[0].readinessStatus).toBe(status);
      await assign(id, expertId);
      expect((await readinessBody(id)).status).toBe('READY');
      const again = await http()
        .get(`/api/projects/${id}`)
        .set(auth(mgrToken))
        .expect(200);
      expect(again.body.readinessStatus).toBe('READY');
    });
  });

  describe('year handling', () => {
    it('evaluates a past mapped year from that year’s assignments', async () => {
      const project = await prisma.project.create({
        data: {
          name: `${tag}-history`,
          createdById: mgrId,
          years: { create: [{ year: year - 1 }, { year }] },
          requirements: {
            create: [
              { skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 1 },
            ],
          },
        },
      });
      await prisma.projectAssignment.create({
        data: { projectId: project.id, year: year - 1, employeeId: beginnerId },
      });
      const past = await readinessBody(project.id, `?year=${year - 1}`);
      expect(past).toMatchObject({ year: year - 1, status: 'READY' });
      const current = await readinessBody(project.id);
      expect(current).toMatchObject({ year, status: 'NOT_READY' });
      expect(current.requirements[0].qualifiedAssigned).toBe(0);
    });

    it('404s an unmapped explicit year and 400s an invalid one', async () => {
      const id = await createProject('years', [req(skillA, 'BEGINNER', 1)]);
      await readiness(id, `?year=${year + 5}`).expect(404);
      await readiness(id, '?year=abc').expect(400);
      await readiness(id, '?year=1900').expect(400);
      await readiness(id, `?year=${year}`).expect(200);
    });

    it('falls back to the latest mapped year when not mapped to the current one', async () => {
      const project = await prisma.project.create({
        data: {
          name: `${tag}-old`,
          createdById: mgrId,
          years: { create: { year: year - 2 } },
        },
      });
      expect(await readinessBody(project.id)).toMatchObject({
        year: year - 2,
        status: 'READY',
      });
    });
  });
});
