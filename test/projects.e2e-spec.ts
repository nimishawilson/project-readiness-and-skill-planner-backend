import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';

interface DetailBody {
  readinessStatus: string;
  assignedEmployees: unknown[];
  requirements: Record<string, unknown>[];
}

describe('Projects & requirements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tag = `e2e${Date.now()}`;
  const year = new Date().getFullYear();

  let mgrToken: string;
  let otherMgrToken: string;
  let empToken: string;
  let mgrId: number;
  let skillA: number; // Angular-like
  let skillB: number; // Java-like
  let beginnerId: number;
  let expertId: number;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = async (email: string) =>
    (
      await http()
        .post('/api/auth/login')
        .send({ email, password: 'password123' })
        .expect(200)
    ).body.accessToken as string;
  const createProject = (body: object, token = mgrToken) =>
    http().post('/api/projects').set(auth(token)).send(body);
  const names = (items: { name: string }[]) => items.map((i) => i.name);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash('password123', 4);
    const mgr = await prisma.employee.create({
      data: {
        name: 'P Manager',
        email: `${tag}-mgr@example.com`,
        passwordHash: hash,
        role: 'MANAGER',
      },
    });
    mgrId = mgr.id;
    await prisma.employee.create({
      data: {
        name: 'P Manager 2',
        email: `${tag}-mgr2@example.com`,
        passwordHash: hash,
        role: 'MANAGER',
      },
    });
    await prisma.employee.create({
      data: {
        name: 'P Employee',
        email: `${tag}-emp@example.com`,
        passwordHash: hash,
        managerId: mgr.id,
      },
    });
    skillA = (await prisma.skill.create({ data: { name: `${tag}-A` } })).id;
    skillB = (await prisma.skill.create({ data: { name: `${tag}-B` } })).id;
    beginnerId = (
      await prisma.employee.create({
        data: {
          name: 'Beginner',
          email: `${tag}-beg@example.com`,
          passwordHash: hash,
          managerId: mgr.id,
          skills: { create: [{ skillId: skillA, level: 'BEGINNER' }] },
        },
      })
    ).id;
    expertId = (
      await prisma.employee.create({
        data: {
          name: 'Expert',
          email: `${tag}-exp@example.com`,
          passwordHash: hash,
          managerId: mgr.id,
          skills: {
            create: [
              { skillId: skillA, level: 'EXPERT' },
              { skillId: skillB, level: 'INTERMEDIATE' },
            ],
          },
        },
      })
    ).id;
    mgrToken = await login(`${tag}-mgr@example.com`);
    otherMgrToken = await login(`${tag}-mgr2@example.com`);
    empToken = await login(`${tag}-emp@example.com`);
  });

  afterAll(async () => {
    // Projects first: owner FK is RESTRICT; they cascade requirements/assignments.
    await prisma.project.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employeeSkill.deleteMany({
      where: { skill: { name: { startsWith: tag } } },
    });
    await prisma.skill.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employee.deleteMany({ where: { email: { contains: tag } } });
    await app.close();
  });

  describe('access control', () => {
    it('requires a token', async () => {
      await http().get('/api/projects').expect(401);
      await http().post('/api/projects').send({ name: 'x' }).expect(401);
      await http().get('/api/projects/1').expect(401);
    });

    it('is managers only', async () => {
      await http().get('/api/projects').set(auth(empToken)).expect(403);
      await createProject({ name: `${tag}-x` }, empToken).expect(403);
      await http().get('/api/projects/1').set(auth(empToken)).expect(403);
      await http()
        .patch('/api/projects/1')
        .set(auth(empToken))
        .send({ name: 'x' })
        .expect(403);
      await http()
        .post('/api/projects/1/requirements')
        .set(auth(empToken))
        .send({ skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 1 })
        .expect(403);
    });
  });

  describe('POST /projects', () => {
    it('creates a project without requirements: owned, current-year, READY', async () => {
      const res = await createProject({
        name: `  ${tag}   Plain  `,
        description: ' desc ',
      }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        name: `${tag} Plain`,
        description: 'desc',
        createdYear: year,
        years: [year],
        readinessStatus: 'READY',
      });
      const row = await prisma.project.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row.createdById).toBe(mgrId);
    });

    it('succeeds even though requirements are unmet (NOT_READY)', async () => {
      const res = await createProject({
        name: `${tag}-unmet`,
        requirements: [
          { skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 2 },
          { skillId: skillB, minLevel: 'INTERMEDIATE', peopleRequired: 1 },
        ],
      }).expect(201);
      expect(res.body.readinessStatus).toBe('NOT_READY');
      const detail = await http()
        .get(`/api/projects/${res.body.id}`)
        .set(auth(mgrToken))
        .expect(200);
      expect(detail.body.requirements).toHaveLength(2);
    });

    it('validates the body', async () => {
      await createProject({}).expect(400);
      await createProject({ name: '   ' }).expect(400);
      await createProject({ name: 'a'.repeat(101) }).expect(400);
      await createProject({ name: 'x', requirements: 'nope' }).expect(400);
      await createProject({
        name: 'x',
        requirements: [
          { skillId: skillA, minLevel: 'GURU', peopleRequired: 1 },
        ],
      }).expect(400);
      await createProject({
        name: 'x',
        requirements: [
          { skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 0 },
        ],
      }).expect(400);
      await createProject({
        name: 'x',
        requirements: [
          { skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 1001 },
        ],
      }).expect(400);
    });

    it('rejects duplicate skill+level pairs and unknown skills, creating nothing', async () => {
      const dup = { skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 1 };
      await createProject({
        name: `${tag}-dup`,
        requirements: [dup, dup],
      }).expect(400);
      await createProject({
        name: `${tag}-nosuch`,
        requirements: [{ ...dup, skillId: 999999 }],
      }).expect(404);
      expect(
        await prisma.project.count({
          where: { name: { startsWith: `${tag}-dup` } },
        }),
      ).toBe(0);
      expect(
        await prisma.project.count({
          where: { name: { startsWith: `${tag}-nosuch` } },
        }),
      ).toBe(0);
    });

    it('allows the same skill at two levels', async () => {
      await createProject({
        name: `${tag}-two-levels`,
        requirements: [
          { skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 1 },
          { skillId: skillA, minLevel: 'EXPERT', peopleRequired: 1 },
        ],
      }).expect(201);
    });
  });

  describe('readiness and detail', () => {
    let projectId: number;

    beforeAll(async () => {
      projectId = (
        await createProject({
          name: `${tag}-ready`,
          requirements: [
            { skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 2 },
            { skillId: skillB, minLevel: 'INTERMEDIATE', peopleRequired: 1 },
          ],
        }).expect(201)
      ).body.id;
    });

    const assign = (employeeId: number) =>
      prisma.projectAssignment.create({
        data: { projectId, year, employeeId },
      });
    const detail = async (): Promise<DetailBody> =>
      (
        await http()
          .get(`/api/projects/${projectId}`)
          .set(auth(mgrToken))
          .expect(200)
      ).body as DetailBody;

    it('shows full remaining headcount with nobody assigned', async () => {
      const d = await detail();
      expect(d).toMatchObject({
        id: projectId,
        year,
        assignedEmployees: [],
        readinessStatus: 'NOT_READY',
      });
      expect(d.requirements).toEqual([
        expect.objectContaining({
          skillId: skillA,
          minLevel: 'BEGINNER',
          required: 2,
          qualifiedAssigned: 0,
          additionalNeeded: 2,
        }),
        expect.objectContaining({
          skillId: skillB,
          minLevel: 'INTERMEDIATE',
          required: 1,
          qualifiedAssigned: 0,
          additionalNeeded: 1,
        }),
      ]);
    });

    it('counts assignees at or above the minimum level', async () => {
      await assign(beginnerId);
      let d = await detail();
      expect(d.assignedEmployees).toEqual([
        {
          employeeId: beginnerId,
          name: 'Beginner',
          skills: [{ skill: `${tag}-A`, level: 'BEGINNER' }],
        },
      ]);
      expect(d.requirements[0]).toMatchObject({
        qualifiedAssigned: 1,
        additionalNeeded: 1,
      });
      expect(d.readinessStatus).toBe('NOT_READY');

      await assign(expertId); // EXPERT in A meets BEGINNER; B INTERMEDIATE meets B
      d = await detail();
      expect(d.requirements[0]).toMatchObject({
        qualifiedAssigned: 2,
        additionalNeeded: 0,
      });
      expect(d.requirements[1]).toMatchObject({
        qualifiedAssigned: 1,
        additionalNeeded: 0,
      });
      expect(d.readinessStatus).toBe('READY');
    });

    it('reflects skill-level edits immediately and appears in the list', async () => {
      await prisma.employeeSkill.update({
        where: {
          employeeId_skillId: { employeeId: expertId, skillId: skillB },
        },
        data: { level: 'BEGINNER' },
      });
      expect((await detail()).readinessStatus).toBe('NOT_READY');
      const list = await http()
        .get(`/api/projects?q=${tag}-ready`)
        .set(auth(mgrToken))
        .expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({
          id: projectId,
          assignedCount: 2,
          readinessStatus: 'NOT_READY',
        }),
      ]);
    });

    it('404s an unmapped explicit year and 400s a bad year', async () => {
      await http()
        .get(`/api/projects/${projectId}?year=${year + 5}`)
        .set(auth(mgrToken))
        .expect(404);
      await http()
        .get(`/api/projects/${projectId}?year=abc`)
        .set(auth(mgrToken))
        .expect(400);
      await http()
        .get(`/api/projects/${projectId}?year=${year}`)
        .set(auth(mgrToken))
        .expect(200);
    });

    it('404s a missing project', async () => {
      await http().get('/api/projects/999999').set(auth(mgrToken)).expect(404);
    });
  });

  describe('GET /projects (list, filters, privacy)', () => {
    const listTag = `${tag}-list`;
    let otherProjectId: number;

    beforeAll(async () => {
      for (const n of ['b', 'a', 'c']) {
        await createProject({ name: `${listTag}-${n}` }).expect(201);
      }
      await createProject({
        name: `${listTag}-needs`,
        requirements: [
          { skillId: skillA, minLevel: 'EXPERT', peopleRequired: 1 },
        ],
      }).expect(201);
      otherProjectId = (
        await createProject(
          { name: `${listTag}-theirs` },
          otherMgrToken,
        ).expect(201)
      ).body.id;
    });

    it('lists only your own projects, ordered by name', async () => {
      const res = await http()
        .get(`/api/projects?q=${listTag}`)
        .set(auth(mgrToken))
        .expect(200);
      expect(names(res.body.items)).toEqual([
        `${listTag}-a`,
        `${listTag}-b`,
        `${listTag}-c`,
        `${listTag}-needs`,
      ]);
      expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 4 });
      const theirs = await http()
        .get(`/api/projects?q=${listTag}`)
        .set(auth(otherMgrToken))
        .expect(200);
      expect(names(theirs.body.items)).toEqual([`${listTag}-theirs`]);
    });

    it('searches case-insensitively and paginates', async () => {
      const q = await http()
        .get(`/api/projects?q=${listTag.toUpperCase()}-NEEDS`)
        .set(auth(mgrToken))
        .expect(200);
      expect(names(q.body.items)).toEqual([`${listTag}-needs`]);
      const p2 = await http()
        .get(`/api/projects?q=${listTag}&page=2&pageSize=3`)
        .set(auth(mgrToken))
        .expect(200);
      expect(names(p2.body.items)).toEqual([`${listTag}-needs`]);
      expect(p2.body).toMatchObject({ page: 2, pageSize: 3, total: 4 });
    });

    it('filters by readiness with an exact total', async () => {
      const ready = await http()
        .get(`/api/projects?q=${listTag}&readiness=READY&pageSize=2`)
        .set(auth(mgrToken))
        .expect(200);
      expect(ready.body.total).toBe(3);
      expect(ready.body.items).toHaveLength(2);
      const notReady = await http()
        .get(`/api/projects?q=${listTag}&readiness=NOT_READY`)
        .set(auth(mgrToken))
        .expect(200);
      expect(names(notReady.body.items)).toEqual([`${listTag}-needs`]);
      expect(notReady.body.total).toBe(1);
    });

    it('filters by year (only mapped years) and validates the query', async () => {
      const other = await http()
        .get(`/api/projects?q=${listTag}&year=${year - 1}`)
        .set(auth(mgrToken))
        .expect(200);
      expect(other.body).toMatchObject({ items: [], total: 0 });
      await http()
        .get('/api/projects?readiness=MAYBE')
        .set(auth(mgrToken))
        .expect(400);
      await http()
        .get('/api/projects?year=1900')
        .set(auth(mgrToken))
        .expect(400);
      await http()
        .get('/api/projects?pageSize=0')
        .set(auth(mgrToken))
        .expect(400);
    });

    it('forbids another manager on every project route', async () => {
      const req = await prisma.projectRequirement.create({
        data: {
          projectId: otherProjectId,
          skillId: skillB,
          minLevel: 'BEGINNER',
          peopleRequired: 1,
        },
      });
      const base = `/api/projects/${otherProjectId}`;
      await http().get(base).set(auth(mgrToken)).expect(403);
      await http()
        .patch(base)
        .set(auth(mgrToken))
        .send({ name: `${tag}-hijack` })
        .expect(403);
      await http()
        .post(`${base}/requirements`)
        .set(auth(mgrToken))
        .send({ skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 1 })
        .expect(403);
      await http()
        .patch(`${base}/requirements/${req.id}`)
        .set(auth(mgrToken))
        .send({ peopleRequired: 9 })
        .expect(403);
      await http()
        .delete(`${base}/requirements/${req.id}`)
        .set(auth(mgrToken))
        .expect(403);
      const untouched = await prisma.projectRequirement.findUniqueOrThrow({
        where: { id: req.id },
      });
      expect(untouched.peopleRequired).toBe(1);
      // The owner still can.
      await http().get(base).set(auth(otherMgrToken)).expect(200);
    });
  });

  describe('PATCH /projects/:id', () => {
    it('edits name and description, validates, and rejects an empty body', async () => {
      const id = (await createProject({ name: `${tag}-patch` }).expect(201))
        .body.id;
      const res = await http()
        .patch(`/api/projects/${id}`)
        .set(auth(mgrToken))
        .send({ name: `  ${tag}-patched  `, description: ' new ' })
        .expect(200);
      expect(res.body).toMatchObject({
        id,
        name: `${tag}-patched`,
        description: 'new',
      });
      const onlyDesc = await http()
        .patch(`/api/projects/${id}`)
        .set(auth(mgrToken))
        .send({ description: 'again' })
        .expect(200);
      expect(onlyDesc.body.name).toBe(`${tag}-patched`);
      await http()
        .patch(`/api/projects/${id}`)
        .set(auth(mgrToken))
        .send({})
        .expect(400);
      await http()
        .patch(`/api/projects/${id}`)
        .set(auth(mgrToken))
        .send({ name: '   ' })
        .expect(400);
      await http()
        .patch('/api/projects/999999')
        .set(auth(mgrToken))
        .send({ name: 'x' })
        .expect(404);
    });
  });

  describe('requirements', () => {
    let projectId: number;
    let otherProjectId: number;
    let reqId: number;

    beforeAll(async () => {
      projectId = (await createProject({ name: `${tag}-reqs` }).expect(201))
        .body.id;
      otherProjectId = (
        await createProject({
          name: `${tag}-reqs-other`,
          requirements: [
            { skillId: skillB, minLevel: 'BEGINNER', peopleRequired: 1 },
          ],
        }).expect(201)
      ).body.id;
    });

    const base = () => `/api/projects/${projectId}/requirements`;

    it('adds a requirement, rejects duplicates, unknown skills and bad input', async () => {
      const res = await http()
        .post(base())
        .set(auth(mgrToken))
        .send({ skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 2 })
        .expect(201);
      reqId = res.body.id;
      expect(res.body).toEqual({
        id: reqId,
        skillId: skillA,
        skill: `${tag}-A`,
        minLevel: 'BEGINNER',
        peopleRequired: 2,
      });
      await http()
        .post(base())
        .set(auth(mgrToken))
        .send({ skillId: skillA, minLevel: 'BEGINNER', peopleRequired: 5 })
        .expect(409);
      // Same skill, different level is fine.
      await http()
        .post(base())
        .set(auth(mgrToken))
        .send({ skillId: skillA, minLevel: 'EXPERT', peopleRequired: 1 })
        .expect(201);
      await http()
        .post(base())
        .set(auth(mgrToken))
        .send({ skillId: 999999, minLevel: 'BEGINNER', peopleRequired: 1 })
        .expect(404);
      await http()
        .post(base())
        .set(auth(mgrToken))
        .send({ skillId: skillB, minLevel: 'BEGINNER', peopleRequired: 0 })
        .expect(400);
      await http()
        .post('/api/projects/999999/requirements')
        .set(auth(mgrToken))
        .send({ skillId: skillB, minLevel: 'BEGINNER', peopleRequired: 1 })
        .expect(404);
    });

    it('updates a requirement and rejects collisions and empty bodies', async () => {
      const upd = await http()
        .patch(`${base()}/${reqId}`)
        .set(auth(mgrToken))
        .send({ peopleRequired: 4 })
        .expect(200);
      expect(upd.body).toMatchObject({
        id: reqId,
        peopleRequired: 4,
        minLevel: 'BEGINNER',
      });
      // Moving BEGINNER -> EXPERT collides with the existing A/EXPERT row.
      await http()
        .patch(`${base()}/${reqId}`)
        .set(auth(mgrToken))
        .send({ minLevel: 'EXPERT' })
        .expect(409);
      const moved = await http()
        .patch(`${base()}/${reqId}`)
        .set(auth(mgrToken))
        .send({ minLevel: 'INTERMEDIATE' })
        .expect(200);
      expect(moved.body.minLevel).toBe('INTERMEDIATE');
      await http()
        .patch(`${base()}/${reqId}`)
        .set(auth(mgrToken))
        .send({})
        .expect(400);
      await http()
        .patch(`${base()}/${reqId}`)
        .set(auth(mgrToken))
        .send({ peopleRequired: 0 })
        .expect(400);
    });

    it('404s a requirement that belongs to another of your projects', async () => {
      const foreign = (
        await prisma.projectRequirement.findFirstOrThrow({
          where: { projectId: otherProjectId },
        })
      ).id;
      await http()
        .patch(`${base()}/${foreign}`)
        .set(auth(mgrToken))
        .send({ peopleRequired: 9 })
        .expect(404);
      await http()
        .delete(`${base()}/${foreign}`)
        .set(auth(mgrToken))
        .expect(404);
      const still = await prisma.projectRequirement.findUniqueOrThrow({
        where: { id: foreign },
      });
      expect(still.peopleRequired).toBe(1);
      await http()
        .patch(`${base()}/999999`)
        .set(auth(mgrToken))
        .send({ peopleRequired: 1 })
        .expect(404);
    });

    it('deletes a requirement and then 404s', async () => {
      await http().delete(`${base()}/${reqId}`).set(auth(mgrToken)).expect(204);
      await http().delete(`${base()}/${reqId}`).set(auth(mgrToken)).expect(404);
      const d = await http()
        .get(`/api/projects/${projectId}`)
        .set(auth(mgrToken))
        .expect(200);
      expect(
        d.body.requirements.map(
          (r: { requirementId: number }) => r.requirementId,
        ),
      ).not.toContain(reqId);
    });
  });

  describe('seeded project', () => {
    it('Portal Rebuild is owned by the seeded manager and has its requirements', async () => {
      const seededToken = await login('manager@example.com');
      const list = await http()
        .get('/api/projects?q=Portal Rebuild')
        .set(auth(seededToken))
        .expect(200);
      const seeded = list.body.items.find(
        (p: { name: string }) => p.name === 'Portal Rebuild',
      );
      expect(seeded).toBeDefined();
      const d = await http()
        .get(`/api/projects/${seeded.id}`)
        .set(auth(seededToken))
        .expect(200);
      expect(d.body.requirements).toHaveLength(2);
      // Not visible to a different manager.
      await http()
        .get(`/api/projects/${seeded.id}`)
        .set(auth(mgrToken))
        .expect(403);
    });
  });
});
