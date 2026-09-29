# Contribution workflow

This page summarizes the contribution process. The repository-root [CONTRIBUTING.md](../CONTRIBUTING.md) contains the full setup, checks, and pull request guidance.

## Review sequence

1. Discuss substantial work in a GitHub issue before implementation.
2. Make a focused change and preserve current routes, request/response contracts, and integrations unless an issue explicitly authorizes a change.
3. Add or update tests for changed behavior; document manual validation when automated coverage is not practical.
4. Run `npm run lint` and `npm run build` from `frontend/`; run `python -m pytest -q` from `backend/`.
5. Update technical documentation and complete the pull request template.
6. Verify no secrets, personal data, generated files, or unreviewed screenshots are included.

All participants are expected to follow the [Code of Conduct](../CODE_OF_CONDUCT.md). Security concerns must follow [SECURITY.md](../SECURITY.md), not a public issue.
