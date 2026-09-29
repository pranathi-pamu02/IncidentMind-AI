# Contributing

Thank you for helping improve IncidentMind AI. Contributions should be focused, reviewable, and consistent with the current implementation and API contracts.

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).
- Search existing issues and pull requests before proposing duplicate work.
- For substantial changes, open an issue first to agree on scope.
- Never include credentials, personal data, private incident records, local databases, or generated build output.

## Development setup

1. Install Docker Compose v2, Node.js 20 or later, and Python 3.11.
2. Copy `.env.example` to `.env` and configure local secrets. Do not commit `.env`.
3. Start the application with `docker compose up --build`, or start the frontend and backend separately as described in the [deployment guide](docs/DEPLOYMENT.md).

## Checks

Run frontend checks from `frontend/`:

```bash
npm ci
npm run lint
npm run build
```

Run backend tests from `backend/`:

```bash
python -m pip install -r requirements.txt
python -m pytest -q
```

For documentation-only changes, check links and rendered Markdown. If you change a feature, include the most relevant automated test or clear manual verification steps.

## Pull request guidelines

- Keep the change focused and preserve existing features and API contracts unless an explicitly agreed issue requires a change.
- Document user-visible configuration, behavior, or API changes.
- Update technical documentation when implementation details change.
- Do not add screenshots unless they are real, reviewed captures that contain no private data.
- Use a clear, imperative commit subject (for example, `Document incident search API`).
- Complete the pull request template and explain tests, behavior changes, and known limitations.
- Be responsive to review feedback and keep follow-up commits scoped to the review.

## Reporting issues

Use the GitHub issue templates for reproducible bugs and feature proposals. Include expected and actual behavior, steps to reproduce, relevant environment details, and sanitized logs. Do not post secrets or security reports in public issues; follow [SECURITY.md](SECURITY.md) instead.

For additional repository context and known engineering follow-ups, see [the repository review](docs/REPOSITORY_REVIEW.md).
