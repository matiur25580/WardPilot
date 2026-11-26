# WardPilot

**Smarter Hospital Operations. Better Resource Utilization. Connected Care.**

WardPilot is an enterprise-oriented hospital operations and capacity intelligence platform. It is intended to help hospital teams coordinate operational capacity, resources and patient flow through a modular web application.

> **Current stage: Milestone 1 — platform foundation.** This repository currently provides the application skeleton, API infrastructure, database connection configuration, developer tooling and local container setup. Hospital workflows, AI forecasting, external integrations and real operational data are not implemented yet.

## Technology

| Layer | Technology |
| --- | --- |
| Web | React 18, TypeScript, Vite |
| API | Node.js 20+, Express 4, TypeScript |
| Database | MongoDB 7, Mongoose 8 |
| Validation | Zod |
| API security | Helmet, CORS allow-list, request-size limits, rate limiting |
| Tests | Vitest, Supertest, Testing Library |
| Tooling | npm workspaces, ESLint, Prettier |
| Containers | Docker, Docker Compose |
| CI | GitHub Actions |

## Repository layout

```text
.
├── apps/
│   ├── api/src/{config,middleware,routes}/  # API configuration and route layers
│   └── web/src/                             # React application
├── .github/workflows/                      # CI pipeline
├── .env.example
├── docker-compose.yml
├── Dockerfile.api
├── Dockerfile.web
├── eslint.config.js
└── package.json                            # npm workspaces and shared scripts
```

## Prerequisites

- Node.js 20.11 or newer
- npm 10.2 or newer
- MongoDB 7+ (local installation or Docker)
- Docker Engine and Docker Compose plugin (optional)

## Local development

1. Clone the repository and install workspace dependencies:

   ```bash
   git clone https://github.com/matiur25580/WardPilot.git
   cd WardPilot
   npm install
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Start MongoDB locally, or use Docker Compose for the complete containerized stack.
4. Start the API and web application: `npm run dev`.

   - Web: http://localhost:5173
   - API liveness: http://localhost:4000/health
   - API readiness: http://localhost:4000/api/v1/health

The readiness endpoint returns HTTP 503 while MongoDB is disconnected. The liveness endpoint confirms that the HTTP process is responding and does not imply database availability.

## Docker Compose

Start MongoDB, API and web containers with `docker compose up --build`. Stop them with `docker compose down`. To also delete the local MongoDB volume (destructive to local container data), run `docker compose down -v`.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| NODE_ENV | Runtime mode | development |
| API_PORT | API listening port | 4000 |
| API_HOST | API bind address | 0.0.0.0 |
| API_BASE_PATH | Versioned API prefix | /api/v1 |
| CLIENT_ORIGIN | Allowed browser origin | http://localhost:5173 |
| LOG_LEVEL | Reserved application log level | info |
| MONGODB_URI | MongoDB connection string | mongodb://127.0.0.1:27017/wardpilot |
| VITE_API_BASE_URL | Browser-visible API base URL | http://localhost:4000/api/v1 |

Only variables prefixed with `VITE_` are exposed to browser code. Never put credentials or private secrets in a Vite variable. The checked-in `.env.example` contains defaults only; keep real credentials in an untracked local `.env` or deployment secret manager.

## Shared scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and web development servers together |
| `npm run dev:api` / `npm run dev:web` | Run one workspace in watch/dev mode |
| `npm run lint` | Run ESLint |
| `npm run format` | Format supported files with Prettier |
| `npm run format:check` | Check formatting |
| `npm run typecheck` | Type-check both workspaces |
| `npm run test` | Run workspace tests |
| `npm run build` | Build API and web workspaces |
| `npm run check` | Run lint, type-check, tests and builds |

## API conventions and baseline safeguards

- API routes are mounted below configurable `API_BASE_PATH` (default `/api/v1`).
- Responses use a `success` envelope with `data` or `error`.
- Errors flow through one centralized Express error handler.
- Helmet, explicit CORS origin, JSON/urlencoded body limits and a baseline rate limiter are enabled.
- MongoDB is connected before the HTTP server begins accepting requests.
- `/health` is liveness; `/api/v1/health` is dependency readiness.

These are foundation safeguards, not a complete production security review. Authentication, authorization, audit logging, secrets management, TLS/edge policy and operational controls remain future work.

## Testing

Run `npm test` for workspace tests, or `npm run test:watch` for API watch mode. The initial suite covers API liveness/readiness behavior, not-found handling and rendering of the web foundation screen. Persistence integration tests requiring a live MongoDB instance should be added alongside domain persistence features.

## Architecture decisions

- **Modular monolith first:** web and API are separate workspaces; domain modules can grow without premature microservice complexity.
- **Explicit API versioning:** future operational endpoints live under `/api/v1`.
- **Fail-fast configuration:** Zod validates environment variables at API startup.
- **Dependency-aware readiness:** readiness is distinct from liveness.
- **No fabricated domain behavior:** no patient records, bed inventory, capacity metrics, AI predictions or third-party healthcare integrations are included in this foundation.

## Roadmap

1. **Milestone 1 — Foundation:** monorepo, React/TypeScript web app, Express/TypeScript API, MongoDB configuration, security baseline, tests, Docker and CI.
2. **Milestone 2 — Identity and tenancy:** authentication, organization boundaries, role-based access and audit foundations.
3. **Milestone 3 — Hospital and resource registry:** hospitals, facilities, wards, beds and operational master data.
4. **Milestone 4 — Patient flow operations:** admissions, transfers, discharge coordination and operational status workflows.
5. **Milestone 5 — Workforce and inventory:** staff scheduling and critical resource visibility.
6. **Milestone 6 — Operational intelligence:** validated analytics and forecasting based on governed, real application data.

Roadmap items are plans, not claims of existing functionality. Clinical workflows, privacy, security, regulatory requirements and operational safety need domain-expert review before real-world use.

## License

No license has been added yet. All rights reserved unless and until a license is explicitly selected.
