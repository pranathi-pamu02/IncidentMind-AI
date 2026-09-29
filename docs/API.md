# API reference

The canonical interactive OpenAPI UI is available at `/docs` while the API is running. The OpenAPI JSON document is at `/openapi.json`.

## Base URL and authentication

The versioned API base path is `/api/v1`. The health check is at `/health` outside that prefix.

`/health`, `POST /auth/register`, and `POST /auth/login` do not require a token. All other routes require:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

Successful registration and login return a bearer token and a user object. Tokens expire after `JWT_EXPIRE_MINUTES`.

The API returns JSON validation errors for invalid request models (HTTP `422`). Authentication failures return `401`; missing resources return `404`; duplicate registration returns `409`. Responses include an `X-Request-ID` header.

## Health and authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Returns API health and service identifier. |
| `POST` | `/api/v1/auth/register` | No | Creates a user and returns a token. Responds `201`; duplicate email responds `409`. |
| `POST` | `/api/v1/auth/login` | No | Validates credentials and returns a token. |
| `GET` | `/api/v1/auth/me` | Yes | Returns the authenticated user profile. |

Registration request:

```json
{
  "email": "engineer@example.com",
  "name": "Alex Morgan",
  "password": "at-least-10-characters"
}
```

Passwords must be 10–72 characters. Login accepts `email` and `password`.

## Incidents

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/incidents` | Yes | Lists incidents, newest first. |
| `POST` | `/api/v1/incidents` | Yes | Creates an incident and an initial timeline event. Responds `201`. |
| `GET` | `/api/v1/incidents/{incident_id}` | Yes | Returns one incident and its timeline. |
| `PATCH` | `/api/v1/incidents/{incident_id}` | Yes | Updates incident status, resolution, cause, outcome, failed attempts, or notes. |
| `DELETE` | `/api/v1/incidents/{incident_id}` | Yes | Deletes an incident. Responds `204`. |
| `GET` | `/api/v1/incidents/{incident_id}/timeline` | Yes | Returns the incident's timeline events. |
| `GET` | `/api/v1/incidents/{incident_id}/similar` | Yes | Returns similar incident records. |
| `POST` | `/api/v1/incidents/{incident_id}/analyze` | Yes | Analyzes the incident and includes similar incident context. |

Incident list query parameters:

| Parameter | Type | Default | Constraints / behavior |
|---|---|---:|---|
| `q` | string | — | Case-insensitive match against title or description. |
| `severity` | string | — | Exact severity filter. |
| `status` | string | — | Exact status filter. |
| `service` | string | — | Case-insensitive service-name match. |
| `limit` | integer | `50` | `1`–`200`. |
| `offset` | integer | `0` | Must be non-negative. |

Incident creation body:

```json
{
  "title": "Elevated API latency after deploy",
  "description": "p95 latency increased after the latest release.",
  "severity": "high",
  "service_name": "payments-api",
  "logs": "Optional log excerpt",
  "tags": ["latency", "deploy"]
}
```

`title` is 3–240 characters; `description` is 10–10,000 characters; `service_name` is 1–120 characters; `logs` is at most 30,000 characters; `tags` accepts up to 20 entries. Severity is one of `critical`, `high`, `medium`, or `low`.

Incident status is one of `open`, `investigating`, `mitigated`, or `resolved`.

The update body accepts any subset of:

```json
{
  "status": "resolved",
  "root_cause": "Confirmed cause",
  "resolution": "Verified corrective action",
  "failed_attempts": ["Approach that did not work"],
  "outcome": "successful",
  "engineer_notes": "Context for future responders"
}
```

`GET /api/v1/incidents/{incident_id}/similar` accepts `limit` from 1 to 20 (default `5`).

Analysis responses contain `summary`, `root_cause`, `confidence`, `next_actions`, `similar_incidents`, and `source`.

## Search, dashboard, and history

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/search` | Yes | Searches incident memory. |
| `GET` | `/api/v1/dashboard` | Yes | Returns inventory totals, status/severity counts, resolution rate, recent incidents, and services. |
| `GET` | `/api/v1/history` | Yes | Returns incidents with recorded causes or resolutions. |

Search request:

```json
{
  "query": "database connection pool exhausted",
  "limit": 5
}
```

The query must contain 1–4,000 characters; `limit` is 1–20 (default `5`). History accepts `limit` from 1 to 200 (default `100`).

Dashboard `open_incidents` includes both `open` and `investigating` statuses. `resolution_rate` is the percentage of all incidents currently marked `resolved`.

## Assistant

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/chat/history` | Yes | Returns up to 100 messages for the authenticated user, oldest first. |
| `POST` | `/api/v1/chat` | Yes | Searches incident memory and returns an analysis-based answer with references. |

Chat request:

```json
{
  "message": "What resolved the queue backlog?",
  "incident_id": null
}
```

`message` must contain 1–4,000 characters. `incident_id` is optional; if supplied, it must identify an existing incident. Responses include `answer` and a list of incident `references`.
