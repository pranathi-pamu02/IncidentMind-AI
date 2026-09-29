# IncidentMind AI — 3-minute demo

## 0:00 — The problem
“An alert tells us something broke. It rarely tells us what worked the last time. IncidentMind connects today's incident to what the team already learned.”

## 0:20 — Dashboard and memory
Register or sign in. Show the dashboard's 50 seeded incidents, severity/status snapshot, affected services, and memory index. Explain that the sample records are varied examples, not live production data.

## 0:50 — Create a new incident
Create “Database connection pool exhausted” for `payments-api`, severity High. Include a timeout symptom and a sample pool-wait log. Open the incident detail and run analysis.

## 1:25 — Show retrieval and useful caution
Point to the related historical record, similarity score, root-cause hypothesis, and suggested actions. Call out the failed fix warning: increasing the pool without addressing a connection leak made the prior incident worse. Explain that suggestions are advisory and engineers verify preconditions.

## 2:00 — Capture the resolution
Record a root cause and fix, change status to Resolved, and save. Show the timeline and Memory & history page. The updated incident is re-indexed for future search.

## 2:30 — Ask the copilot
Ask “Have we seen database connection timeouts before, and what failed?” Show the grounded answer and clickable memory references.

## Close
“IncidentMind turns incident reports into operational memory, so each response can start with what the team already knows.”

Demo setup: `cp .env.example .env` (or PowerShell `Copy-Item .env.example .env`), then `docker compose up --build`; open `http://localhost:3000` and create an account.
