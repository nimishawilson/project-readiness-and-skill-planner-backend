import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const year = new Date().getFullYear();
  const passwordHash = await bcrypt.hash('password123', 10);

  const engineering = await prisma.department.upsert({
    where: { name: 'Engineering' },
    update: {},
    create: { name: 'Engineering' },
  });

  const manager = await prisma.employee.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      name: 'Maya Manager',
      email: 'manager@example.com',
      passwordHash,
      role: 'MANAGER',
      departmentId: engineering.id,
    },
  });

  const [asha, ravi] = await Promise.all(
    [
      ['Asha Employee', 'asha@example.com'],
      ['Ravi Employee', 'ravi@example.com'],
    ].map(([name, email]) =>
      prisma.employee.upsert({
        where: { email },
        update: {},
        create: {
          name,
          email,
          passwordHash,
          departmentId: engineering.id,
          managerId: manager.id,
        },
      }),
    ),
  );

  const skills = Object.fromEntries(
    await Promise.all(
      ['Angular', 'Java', 'TypeScript', 'SQL'].map(async (name) => {
        const skill = await prisma.skill.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        return [name, skill] as const;
      }),
    ),
  );

  const employeeSkills = [
    { employeeId: asha.id, skillId: skills.Angular.id, level: 'BEGINNER' },
    { employeeId: asha.id, skillId: skills.TypeScript.id, level: 'EXPERT' },
    { employeeId: ravi.id, skillId: skills.Java.id, level: 'INTERMEDIATE' },
  ] as const;
  for (const es of employeeSkills) {
    await prisma.employeeSkill.upsert({
      where: {
        employeeId_skillId: { employeeId: es.employeeId, skillId: es.skillId },
      },
      update: {},
      create: es,
    });
  }

  if (
    (await prisma.learningGoal.count({ where: { employeeId: asha.id } })) === 0
  ) {
    await prisma.learningGoal.create({
      data: { employeeId: asha.id, title: 'Learn NestJS', year },
    });
  }

  if ((await prisma.project.count()) === 0) {
    await prisma.project.create({
      data: {
        name: 'Portal Rebuild',
        description: 'Seed project: Angular x2 beginner, Java x1 intermediate',
        years: {
          create: {
            year,
            assignments: {
              create: [{ employeeId: asha.id }, { employeeId: ravi.id }],
            },
          },
        },
        requirements: {
          create: [
            {
              skillId: skills.Angular.id,
              minLevel: 'BEGINNER',
              peopleRequired: 2,
            },
            {
              skillId: skills.Java.id,
              minLevel: 'INTERMEDIATE',
              peopleRequired: 1,
            },
          ],
        },
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
