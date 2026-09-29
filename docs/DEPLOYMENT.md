# Deployment and operations

## Deployment scope

Docker Compose is the supported local deployment path. The checked-in setup is suitable for development, demos, and evaluation. It is not a hardened multi-tenant production deployment; see [production hardening](#production-hardening) before exposing it to external users.

## Requirements

- Docker Engine or Docker Desktop with Compose v2.
- Ability to pull the configured PostgreSQL, ChromaDB, Python, and Node container images.
- Ports `3000` and `8000` available on the host.

## Configure secrets and services

Create a root `.env` from the example:

```powershell
Copy-Item .env.example .env
```

```bash
cp .env.example .env
```

Set a unique `POSTGRES_PASSWORD` and a cryptographically random `JWT_SECRET` (at least 32 characters). Do not commit `.env`. Keep `AI_MODE=mock` for deterministic analysis using local incident memory. Gemini and Hindsight are optional external services; leave their credentials unset if they are not configured.

### Environment variables

| Variable | Purpose |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | PostgreSQL database initialization. Change the example password before starting. |
| `DATABASE_URL` | SQLAlchemy database connection. Compose defaults to the `db` service. |
| `JWT_SECRET`, `JWT_EXPIRE_MINUTES` | Token signing secret and token lifetime. Use a high-entropy secret outside local development. |
| `CORS_ORIGINS` | Comma-separated allowed browser origins for the API. |
| `NEXT_PUBLIC_API_URL` | API base URL embedded into the frontend at build time. For Compose, the default is `http://localhost:8000/api/v1`. |
| `CHROMA_HOST`, `CHROMA_PORT` | ChromaDB address used by the API. Compose overrides these for its internal service network. |
| `AI_MODE` | Analysis mode. `mock` uses the local evidence-based analyzer; a non-mock mode can use Gemini when a key is configured. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional Google Gemini credentials and model name. |
| `HINDSIGHT_BASE_URL`, `HINDSIGHT_API_KEY`, `HINDSIGHT_BANK_ID` | Optional Hindsight retain/recall integration. |

`NEXT_PUBLIC_API_URL` is public client configuration, not a secret. Keep provider keys and signing secrets private.

## Start and verify

Start the entire stack from the repository root:

```bash
docker compose up --build
```

Check service state and API health:

```bash
docker compose ps
curl http://localhost:8000/health
```

Open the frontend at <http://localhost:3000> and API documentation at <http://localhost:8000/docs>.

The API container waits for PostgreSQL health, invokes `python -m app.seed`, then starts Uvicorn. The seed inserts 50 sample records only when the incidents table is empty. ChromaDB data and PostgreSQL data persist in named volumes.

## Logs, tests, and shutdown

```bash
docker compose logs -f api
docker compose exec api pytest -q
docker compose down
```

To run repository checks on a development machine:

```powershell
Push-Location frontend
npm ci
npm run lint
npm run build
Pop-Location

Push-Location backend
python -m pip install -r requirements.txt
python -m pytest -q
Pop-Location
```

`docker compose down -v` removes the named database and vector-store volumes. Use it only when intentionally discarding local data.

## Optional integrations

### Gemini

Set `GEMINI_API_KEY` and configure `AI_MODE` to a non-mock value, then recreate the API service:

```bash
docker compose up -d --build api
```

If Gemini is unavailable or returns an error, the API logs the failure and falls back to its local evidence-based analysis path.

### Hindsight

Set `HINDSIGHT_BASE_URL`, `HINDSIGHT_API_KEY`, and `HINDSIGHT_BANK_ID` for the target Hindsight service. Retain and recall failures are logged; the relational incident record remains the system of record.

## Production hardening

Before using this deployment with real operational data:

- Replace Compose demo credentials and store secrets in a managed secret store.
- Add user/tenant authorization for incident reads and mutations; current incident data is not scoped by user.
- Restrict open registration or add an organization-controlled identity provider.
- Place services behind TLS termination and restrict network exposure, including PostgreSQL, ChromaDB, and interactive API docs.
- Add rate limiting, security headers, backup/restore procedures, database migration tooling, and resource limits.
- Review browser local-storage token handling and define a threat model for the user-facing application.
- Add automated integration and browser end-to-end checks to CI, plus monitoring and operational alerting.
- Review provider terms and data-handling policies before sending incident content to Gemini or Hindsight.

## Troubleshooting

| Symptom | Checks |
|---|---|
| Web application cannot reach the API | Confirm `NEXT_PUBLIC_API_URL`, API port `8000`, and `CORS_ORIGINS`; rebuild the web image if the public URL changed. |
| API does not become healthy | Inspect `docker compose logs api db`; verify the database URL, PostgreSQL health, and API port. |
| Chroma is unavailable | Inspect API logs and Chroma service state. The application attempts lexical incident search as a fallback. |
| Gemini analysis is not used | Verify `AI_MODE`, the provider key, the configured model, outbound connectivity, and API logs. |
| Sample data is absent | Check that the API seed command completed and inspect database connectivity. Seeding intentionally skips a non-empty incident table. |
