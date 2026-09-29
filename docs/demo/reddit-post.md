# Title
I built IncidentMind AI: an incident copilot that remembers what worked (and what failed)

# Post
Hi folks — I put together a hackathon project called IncidentMind AI.

The premise: alerting systems tell you that something is wrong, but the useful context is often buried in old incident writeups. IncidentMind stores incident symptoms, logs, root causes, resolutions, failed troubleshooting attempts, and notes. For a new report, it searches for similar incidents and offers evidence-linked suggestions.

The stack is Next.js 15, FastAPI, PostgreSQL, ChromaDB, and optional Hindsight/Gemini integrations. There is a Docker Compose setup with 50 fictional sample incidents, so it can be tried locally without external AI credentials. The assistant is advisory and explicitly warns about fixes that failed before.

I’d especially appreciate feedback on the incident workflow and what you’d want captured in a useful postmortem. Setup and API notes are in the repository README.
