# WardPilot

**Smarter Hospital Operations. Better Resource Utilization. Connected Care.**

WardPilot is an enterprise-oriented hospital operations and capacity intelligence platform. It is being developed as a modular web application for coordinating hospital resources and patient flow.

> **Current stage: Milestone 2 — identity and multi-tenancy foundation.** The repository includes a React/TypeScript web app, an Express/TypeScript API, MongoDB persistence, organization registration, authentication, rotating refresh sessions, organization memberships and role-aware tenant access. Hospital workflows, AI forecasting, external healthcare integrations and real operational patient data are not implemented.

## Technology

| Layer | Technology |
| --- | --- |
| Web | React 18, TypeScript, Vite |
| API | Node.js 20+, Express 4, TypeScript |
| Database | MongoDB 7, Mongoose 8 |
| Validation | Zod |
| Authentication | bcryptjs, JWT, HTTP-only refresh cookie |
| API security | Helmet, CORS allow-list, rate limiting, request-size limits |
| Tests | Vitest, Supertest, Testing Library |
| Tooling | npm workspaces, ESLint, Prettier |
| Containers | Docker, Docker Compose |
| CI | GitHub Actions |

## Repository layout

```text
.
├── apps/
│   ├── api/src/
│   │   ├── auth/          # schemas, token service, authentication and RBAC middleware
│   │   ├── config/        # validated environment and MongoDB connection
│   │   ├── middleware/    # centralized API errors and 404 handling
│   │   ├── models/        # users, organizations, memberships and refresh sessions
│   │   └── routes/        # health and tenant-scoped organization endpoints
│   └── web/src/           # React sign-in and organization registration experience
├── .github/workflows/    # CI pipeline
├── .env.example
├── docker-compose.yml
├── Dockerfile.api
├── Dockerfile.web
└── package.json          # npm workspaces and shared scripts
```

## Prerequisites

- Node.js 20.11 or newer
- npm 10.2 or newer
- MongoDB 7+ (local installation or Docker)
- Docker Engine and Docker Compose plugin (optional)

## Local development

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/matiur25580/WardPilot.git
   cd WardPilot
   npm install
   ```

2. Create a local environment file and replace both JWT secret placeholders with different, random values (at least 32 characters each):

   ```bash
   cp .env.example .env
   ```

3. Start MongoDB locally, or start the full containerized stack with `docker compose up --build`.
4. For a local non-container run, start the web and API workspaces with `npm run dev`.

   - Web: http://localhost:5173
   - API liveness: http://localhost:4000/health
   - API readiness: http://localhost:4000/api/v1/health

The API connects to MongoDB before listening. The readiness endpoint returns HTTP 503 when MongoDB is disconnected.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| NODE_ENV | Runtime mode | development |
| API_PORT | API listening port | 4000 |
| API_HOST | API bind address | 0.0.0.0 |
| API_BASE_PATH | Versioned API prefix | /api/v1 |
| CLIENT_ORIGIN | Exact allowed browser origin | http://localhost:5173 |
| MONGODB_URI | MongoDB connection string | mongodb://127.0.0.1:27017/wardpilot |
| JWT_ACCESS_SECRET | Signing secret for short-lived access tokens | Development-only fallback |
| JWT_REFRESH_SECRET | Separate signing secret for refresh tokens | Development-only fallback |
| JWT_ACCESS_TTL | Access token lifetime | 15m |
| JWT_REFRESH_TTL | Refresh session lifetime | 7d |
| VITE_API_BASE_URL | Browser-visible API base URL | http://localhost:4000/api/v1 |

Production startup rejects the development JWT secret defaults. Configure independent, randomly generated secrets in the deployment secret manager. Only variables prefixed with `VITE_` are exposed to browser code; never put secrets in Vite variables.

## Authentication and tenant model

- Registration creates a user, a new organization and an initial `owner` membership.
- Passwords are hashed with bcryptjs (12 rounds); password hashes are never selected by default.
- Login returns a short-lived signed access token. The refresh JWT is stored only as an HTTP-only, same-site cookie; the browser UI keeps the access token in memory and does not persist it in local storage.
- Refresh tokens are stored as SHA-256 hashes in MongoDB and rotated on successful refresh. Reuse of an already-rotated token revokes active sessions for that user and organization.
- Logout revokes the presented refresh session and clears its cookie.
- Authenticated requests resolve the current active membership from MongoDB. Organization ID and role are taken from that membership, not trusted from client-supplied request fields.
- Membership roles are `owner`, `admin`, `manager`, `staff` and `viewer`. Organization member listing is available to owner/admin/manager; adding an existing WardPilot account is restricted to owner/admin.
- Tenant-owned queries must always include the authenticated `req.auth.tenantId` / `req.auth.organizationId` scope. Do not accept a tenant ID from an untrusted request body or query string.

### API endpoints

All endpoints below are under `/api/v1`.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Create account, organization and owner membership |
| POST | `/auth/login` | Public, rate limited | Authenticate and issue tokens |
| POST | `/auth/refresh` | Refresh cookie | Rotate refresh session |
| POST | `/auth/logout` | Refresh cookie | Revoke current refresh session |
| GET | `/auth/me` | Access token | Return current user and organization |
| GET | `/organizations/current` | Access token | Return the authenticated tenant |
| GET | `/organizations/members` | Owner/admin/manager | List organization members |
| POST | `/organizations/members` | Owner/admin | Add an existing user to this organization |

The member-add endpoint does not send invitations or emails; the target user must already have a WardPilot account. Ownership transfer, organization switching, password reset, email verification, MFA and administrative session management are not implemented yet.

## Shared scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and web development servers together |
| `npm run dev:api` / `npm run dev:web` | Run one workspace |
| `npm run lint` | Run ESLint |
| `npm run format` | Format supported files |
| `npm run format:check` | Check formatting |
| `npm run typecheck` | Type-check both workspaces |
| `npm run test` | Run workspace tests |
| `npm run build` | Build API and web workspaces |
| `npm run check` | Run lint, type-check, tests and builds |

## Docker Compose

Run `docker compose up --build` to start MongoDB, API and web containers. Stop with `docker compose down`. Removing the volume with `docker compose down -v` permanently deletes local MongoDB container data.

## Security boundaries and known limitations

This is an evolving application foundation, not a certified or production-ready healthcare system. Before real deployment, add independent security review, TLS and secure deployment configuration, CSRF protections appropriate to the final domain topology, email verification, password reset, MFA, audit trails, session/device management, rate-limit storage suitable for multiple API replicas, backup/restore procedures, privacy controls and regulatory review. Authentication and tenancy must be accompanied by tests for cross-tenant access denial before adding patient or clinical workflows.

Registration currently creates organization/user/membership records using compensating cleanup rather than a multi-document transaction, so a MongoDB replica-set transaction strategy should be introduced before critical production workflows.

## Roadmap

1. **Milestone 1 — Foundation:** monorepo, React/TypeScript, Express/TypeScript, MongoDB config, tests, Docker and CI.
2. **Milestone 2 — Identity and tenancy:** user authentication, organization registration, rotating refresh sessions, membership and role-aware tenant context.
3. **Milestone 3 — Hospital registry:** hospitals, facilities, wards, beds and operational master data.
4. **Milestone 4 — Patient flow operations:** admissions, transfers, discharge coordination and workflow state transitions.
5. **Milestone 5 — Workforce and inventory:** staff scheduling and critical resource visibility.
6. **Milestone 6 — Operational intelligence:** validated analytics and forecasting based on governed application data.

Roadmap items are plans, not claims of existing functionality. Clinical workflows, privacy, security, regulatory requirements and operational safety require domain-expert review before real-world use.

## License

No license has been added yet. All rights reserved unless and until a license is explicitly selected.
