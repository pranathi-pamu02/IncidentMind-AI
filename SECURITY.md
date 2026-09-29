# Security Policy

## Project security status

IncidentMind AI is a portfolio and evaluation project. The current Compose configuration is intended for local development and demonstrations, not an internet-facing, multi-tenant production environment. See the [deployment hardening guidance](docs/DEPLOYMENT.md#production-hardening).

Known limitations include open registration, no user/tenant scoping for incident records, browser-local token storage, development-oriented configuration defaults, and publicly enabled FastAPI documentation. Do not store real production incident data in an exposed deployment without addressing these boundaries.

## Reporting a vulnerability

Please do not report vulnerabilities in public issues or pull requests. Use GitHub's private vulnerability reporting for this repository if it is enabled. If private reporting is unavailable, contact the maintainer privately through the [maintainer's GitHub profile](https://github.com/pranathi-pamu02); do not publish exploit details while seeking contact.

Include the affected component, impact, reproduction steps, and any mitigations you identified. Avoid sending real credentials, personal information, or production incident data.

## Response expectations

The maintainer will acknowledge reports as availability permits, investigate their scope and impact, and coordinate any fix and disclosure with the reporter. No fixed response or remediation SLA is currently provided.

## Supported versions

No release or long-term-support policy is currently defined. Reports against the current default branch are the most actionable.
