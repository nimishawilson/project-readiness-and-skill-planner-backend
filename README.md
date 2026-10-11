# Skills & Project Readiness Portal — Backend

REST API for the Skills & Project Readiness Portal. Managers maintain their team's skills and proficiency levels, assign learning goals, and create projects with skill requirements. The API reports whether each project is ready to start. Employees view their own skills, learning goals and projects, and advance their own goal progress.

**Stack:** NestJS 11 · PostgreSQL · Prisma 7 · JWT auth · Swagger (OpenAPI)

The functional specification and the endpoint contract live in the workspace root, next to this folder:

- `../spec.md` — what the product does
- `../API_ENDPOINTS.md` — every endpoint, with request/response shapes, rules and error codes

All 10 phases of the contract are implemented.

## Prerequisites

- A current Node.js LTS (developed on Node 24) and npm
- PostgreSQL, with an empty database for the app

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your env file and edit it (see "Environment variables")
cp .env.example .env

# 3. Generate the Prisma client (output goes to src/generated/prisma, which is git-ignored)
npm run prisma:generate

# 4. Create the tables
npm run prisma:migrate

# 5. Load the demo data
npm run prisma:seed
```

Run steps 3 and 4 again whenever you pull changes that touch `prisma/schema.prisma` or add a migration. Step 3 is also needed after every fresh checkout.

Outside local development, apply existing migrations without creating new ones: `npx prisma migrate deploy`.

## Environment variables

Configure these in `.env`. The app refuses to start if a required one is missing.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string, e.g. `postgresql://USER:PASSWORD@localhost:5432/skills_portal?schema=public` |
| `JWT_SECRET` | yes | — | Secret used to sign access tokens. Use a long random value. |
| `JWT_EXPIRES_IN` | no | `1h` | Access-token lifetime, e.g. `1h`, `30m` |
| `CORS_ORIGIN` | no | any origin | Comma-separated list of allowed browser origins, e.g. `http://localhost:4200`. Set it outside local development. |
| `PORT` | no | `3000` | HTTP port |

## Run

```bash
npm run start:dev    # watch mode
npm run start        # no watch
npm run build && npm run start:prod   # compiled build (dist/main.js)
```

| What | URL (default port) |
|---|---|
| API base path | `http://localhost:3000/api` |
| Swagger UI | `http://localhost:3000/docs` |
| OpenAPI JSON | `http://localhost:3000/docs-json` |
| Health check (public) | `http://localhost:3000/api` |

In Swagger UI, call `POST /api/auth/login`, copy the `accessToken`, click **Authorize** and paste it. Every other endpoint needs `Authorization: Bearer <token>`.

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"manager@example.com","password":"password123"}'
```

## Demo data

`npm run prisma:seed` is idempotent: running it again does not duplicate rows. (The demo goal is only created while Asha has no goals, and the demo project only while the database has no projects at all.) All seeded users share the password `password123`. **Demo credentials only, never seed a production database.**

| User | Email | Role | Notes |
|---|---|---|---|
| Maya Manager | `manager@example.com` | `MANAGER` | Manages Asha and Ravi; owns the demo project |
| Asha Employee | `asha@example.com` | `EMPLOYEE` | Angular (Beginner), TypeScript (Expert), goal "Learn NestJS" |
| Ravi Employee | `ravi@example.com` | `EMPLOYEE` | Java (Intermediate) |

It also creates the department `Engineering`, the skills `Angular`, `Java`, `TypeScript` and `SQL`, and the project **Portal Rebuild** (Angular ≥ Beginner × 2, Java ≥ Intermediate × 1). Asha and Ravi are assigned to it for the current year, so it starts as `NOT_READY` (one more qualified Angular person needed).

## API overview

Base path `/api`. Everything requires a JWT except `POST /auth/login`. The role comes from the token; managers act on their own team only.

| Area | Endpoints | Who |
|---|---|---|
| Auth | `POST /auth/login`, `GET /auth/me` | public / any |
| Departments | `GET /departments` | any |
| Employees | `GET/POST /employees`, `GET/PATCH /employees/:id` | manager |
| Skill catalog | `GET /skills` (any), `POST/PATCH/DELETE /skills…` | manager |
| Employee skills & matrix | `/employees/:id/skills…`, `GET /skills-matrix` | manager |
| Learning goals | `/employees/:id/learning-goals`, `/learning-goals/…` (update, approve, pending approval, map year) | manager |
| Projects & requirements | `/projects…`, `/projects/:id/requirements…` | manager (owner) |
| Assignments | `/projects/:id/assignments…`, `GET /employees/:id/projects` | manager (owner / team) |
| Readiness | `GET /projects/:id/readiness` | manager (owner) |
| Year mapping | `POST /projects/:id/map-year`, `GET /projects/:id/years` | manager (owner) |
| Employee self-service | `GET /me/profile`, `/me/skills`, `/me/learning-goals`, `PATCH /me/learning-goals/:id/progress`, `GET /me/projects/current`, `/me/projects/past` | employee |

See `../API_ENDPOINTS.md` for the full contract.

## Business rules worth knowing

- **Roles and teams.** A manager's team is the employees whose `managerId` is theirs. Managers can only work on their own team (`403` otherwise). Only managers create employees; there is no self-registration.
- **Proficiency levels** are ordered Beginner < Intermediate < Expert. An employee qualifies for a requirement when their level is at or above the required one.
- **Learning goals.** At most 3 per employee per year. Progress (`NOT_STARTED` → `IN_PROGRESS` → `COMPLETED`) is separate from the manager's approval. An employee completing a goal makes it available for approval; it does not approve it. Approved goals are locked. Only a manager can map a goal to another year.
- **Projects are private to the manager who created them.** Other managers get `403`.
- **Readiness.** For each requirement, `additionalNeeded = max(0, required − qualifiedAssigned)`. A project is `READY` only when every requirement is met (and a project with no requirements is `READY`). It is computed on every read and never stored. Projects can be created and managed regardless of readiness.
- **Years.** Projects and goals belong to the year of their creation date. Mapping a project to a new year (current year or later, and after its latest mapped year) copies its latest year's assignments forward. Assignments can only be changed for the current year; earlier years are read-only history. Employees see current-year projects as active and earlier years as past projects.

## Tests

```bash
npm test             # unit tests (no database needed)
npm run test:cov     # unit tests with coverage
npm run test:e2e     # end-to-end tests
```

The e2e tests run against the **real database** from `DATABASE_URL`, so it must be migrated and seeded first (they log in as the seeded users). They create tagged test rows and delete them afterwards. Run them against a local development database, never against shared or production data.

## Project layout

```
prisma/                 schema.prisma, migrations, seed.ts
src/
  auth/                 login, JWT strategy, global guards, team-access check
  departments/ employees/ skills/
  employee-skills/      employee skill mapping and the skills matrix
  learning-goals/
  projects/             projects, requirements, readiness, year mapping
  project-assignments/  assigning employees, per-employee project lists
  common/               shared decorators, pagination, mappers, utils
  generated/prisma/     generated Prisma client (git-ignored)
test/                   e2e specs and helpers
```

## Other scripts

| Script | Purpose |
|---|---|
| `npm run lint` | ESLint (auto-fixes) |
| `npm run format` | Prettier |
| `npm run prisma:studio` | Browse the database in Prisma Studio |

## Troubleshooting

- **`Missing required env vars: …`** — set `DATABASE_URL` and `JWT_SECRET` in `.env`.
- **`Cannot find module … generated/prisma`** — run `npm run prisma:generate`.
- **e2e tests fail on login** — the database isn't seeded; run `npm run prisma:seed`.
- **`401` on every request** — the token is missing, expired (`JWT_EXPIRES_IN`) or was signed with a different `JWT_SECRET`.
