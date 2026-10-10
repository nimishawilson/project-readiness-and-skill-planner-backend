import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';

describe('Skill catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tag = `e2e${Date.now()}`;

  let managerToken: string;
  let ashaToken: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = async (email: string) =>
    (
      await http()
        .post('/api/auth/login')
        .send({ email, password: 'password123' })
        .expect(200)
    ).body.accessToken as string;
  const create = (name: string) =>
    http().post('/api/skills').set(auth(managerToken)).send({ name });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    managerToken = await login('manager@example.com');
    ashaToken = await login('asha@example.com');
  });

  afterAll(async () => {
    await prisma.projectRequirement.deleteMany({
      where: { skill: { name: { startsWith: tag } } },
    });
    await prisma.project.deleteMany({ where: { name: { startsWith: tag } } });
    await prisma.employeeSkill.deleteMany({
      where: { skill: { name: { startsWith: tag } } },
    });
    await prisma.skill.deleteMany({ where: { name: { startsWith: tag } } });
    await app.close();
  });

  it('lists the catalog for both roles, ordered by name', async () => {
    for (const token of [managerToken, ashaToken]) {
      const res = await http().get('/api/skills').set(auth(token)).expect(200);
      const names: string[] = res.body.map((s: { name: string }) => s.name);
      expect(names).toEqual(
        expect.arrayContaining(['Angular', 'Java', 'TypeScript', 'SQL']),
      );
      const sorted = [...names].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      );
      expect(names).toEqual(sorted);
    }
    await http().get('/api/skills').expect(401);
  });

  it('forbids employees from changing the catalog', async () => {
    await http()
      .post('/api/skills')
      .set(auth(ashaToken))
      .send({ name: `${tag}-nope` })
      .expect(403);
    await http()
      .patch('/api/skills/1')
      .set(auth(ashaToken))
      .send({ name: 'x' })
      .expect(403);
    await http().delete('/api/skills/1').set(auth(ashaToken)).expect(403);
  });

  it('creates a skill with a normalised name and rejects case-variant duplicates', async () => {
    const res = await create(`  ${tag}   Type   Script `).expect(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      name: `${tag} Type Script`,
    });
    await create(`${tag} TYPE script`).expect(409);
    const list = await http().get('/api/skills').set(auth(managerToken));
    expect(
      list.body.filter((s: { name: string }) => s.name.startsWith(tag)),
    ).toHaveLength(1);
  });

  it('validates the name', async () => {
    await create('   ').expect(400);
    await create('a'.repeat(51)).expect(400);
    await http()
      .post('/api/skills')
      .set(auth(managerToken))
      .send({})
      .expect(400);
  });

  it('renames a skill, allows recasing, and 409s on a clash', async () => {
    const a = (await create(`${tag}-ren-a`).expect(201)).body;
    const b = (await create(`${tag}-ren-b`).expect(201)).body;

    const renamed = await http()
      .patch(`/api/skills/${a.id}`)
      .set(auth(managerToken))
      .send({ name: `${tag}-REN-A` })
      .expect(200);
    expect(renamed.body.name).toBe(`${tag}-REN-A`);

    await http()
      .patch(`/api/skills/${b.id}`)
      .set(auth(managerToken))
      .send({ name: `${tag}-ren-a` })
      .expect(409);
    await http()
      .patch('/api/skills/99999999')
      .set(auth(managerToken))
      .send({ name: `${tag}-ghost` })
      .expect(404);
    await http()
      .patch(`/api/skills/${a.id}`)
      .set(auth(managerToken))
      .send({})
      .expect(400);
    await http()
      .patch('/api/skills/abc')
      .set(auth(managerToken))
      .send({ name: 'x' })
      .expect(400);
  });

  it('deletes an unused skill (204) then 404s', async () => {
    const { id } = (await create(`${tag}-del`).expect(201)).body;
    await http()
      .delete(`/api/skills/${id}`)
      .set(auth(managerToken))
      .expect(204);
    await http()
      .delete(`/api/skills/${id}`)
      .set(auth(managerToken))
      .expect(404);
  });

  it('refuses to delete a skill mapped to an employee', async () => {
    const { id } = (await create(`${tag}-mapped`).expect(201)).body;
    const asha = await prisma.employee.findUniqueOrThrow({
      where: { email: 'asha@example.com' },
    });
    await prisma.employeeSkill.create({
      data: { employeeId: asha.id, skillId: id, level: 'BEGINNER' },
    });
    const res = await http()
      .delete(`/api/skills/${id}`)
      .set(auth(managerToken))
      .expect(409);
    expect(res.body.message).toContain('1 employee(s)');
  });

  it('refuses to delete a skill used in a project requirement', async () => {
    const { id } = (await create(`${tag}-required`).expect(201)).body;
    await prisma.project.create({
      data: {
        name: `${tag}-project`,
        requirements: {
          create: { skillId: id, minLevel: 'BEGINNER', peopleRequired: 1 },
        },
      },
    });
    const res = await http()
      .delete(`/api/skills/${id}`)
      .set(auth(managerToken))
      .expect(409);
    expect(res.body.message).toContain('1 project requirement(s)');
  });
});
