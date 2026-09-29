"""Seed 50 realistic, varied sample incidents and index their memories."""
from datetime import timedelta
from sqlalchemy.orm import Session
from .database import SessionLocal, Base, engine
from .models import Incident, TimelineEvent, now
from .services import memory

services=["payments-api","auth-service","postgres-primary","checkout-web","search-indexer","worker-queue","edge-gateway","billing-engine","inventory-api","notifications"]
patterns=[
 ("Database connection pool exhausted","Connections saturated after a traffic spike; pool wait time exceeded 30s.","Connection leak in report worker left sessions open.","Restarted workers, fixed session cleanup, and tuned pool size after load test.",["Raised pool size without fixing leak","Restarted database without draining workers"],"high"),
 ("Elevated API latency after deploy","p95 latency rose from 180ms to 2.8s immediately after release.","New ORM query caused an N+1 lookup on the hot path.","Rolled back release, added eager loading, then redeployed with query budget alerts.",["Scaled pods before checking database query counts"],"high"),
 ("Queue backlog not draining","Consumer lag climbed steadily while producers remained healthy.","Poison messages repeatedly retried and blocked each partition.","Quarantined malformed payloads, deployed bounded retries, and replayed the dead-letter queue.",["Increased consumer count; all workers hit the same poison message"],"medium"),
 ("Intermittent 502 responses","Gateway reported upstream reset errors in several regions.","Readiness probe passed before the application finished warming its cache.","Adjusted startup and readiness probes and verified regional rollout health.",["Raised gateway timeout, masking rather than fixing startup failure"],"critical"),
 ("Authentication failures for valid users","Login failures increased after key rotation; refresh tokens rejected.","One API replica still referenced the prior signing key.","Completed rolling restart and added key-version telemetry to auth checks.",["Cleared user sessions before checking replica configuration"],"medium"),
 ("Disk usage alert on primary","Filesystem crossed 90%; write latency started increasing.","Expired WAL archives were retained by a stalled backup slot.","Repaired backup consumer, confirmed archive recovery, and added slot-age alerts.",["Deleted WAL files manually; risked point-in-time recovery"],"critical"),
 ("Search results stale","Index lag exceeded 20 minutes despite healthy API responses.","Indexer consumer used an obsolete schema version and dropped updates.","Replayed from change stream after deploying compatible schema handling.",["Rebuilt entire index before identifying dropped events"],"low"),
 ("Webhook delivery retries spiking","Partner callbacks timed out and retry queue grew.","Outbound NAT connection exhaustion under concurrent delivery.","Enabled connection reuse and bounded concurrency; coordinated replay with partner.",["Raised retry frequency, amplifying outbound load"],"medium"),
]
def seed(db:Session):
    if db.query(Incident).count(): return 0
    created=[]
    for n in range(50):
        title,desc,cause,resolution,failed,severity=patterns[n%len(patterns)]; service=services[(n*3+n//4)%len(services)]
        status=["resolved","resolved","investigating","open","mitigated"][n%5]
        i=Incident(title=f"{title} — {service}",description=f"{desc} Sample occurrence {n+1}; impact affected {120+n*37} requests. Triggered alerts on {service}.",severity=severity,service_name=service,logs=f"{service} request_id=req-{n+1:04d} error_count={18+n} window=5m",tags=[service.split("-")[0],"sample","database" if "Database" in title or "Disk" in title else "service-health"],status=status,root_cause=cause if status=="resolved" else None,resolution=resolution if status=="resolved" else None,failed_attempts=failed, outcome="successful" if status=="resolved" else None,engineer_notes=f"Synthetic demo record {n+1}. Validate service-specific impact before applying any mitigation.",created_at=now()-timedelta(days=n*2+1))
        db.add(i); db.flush(); db.add(TimelineEvent(incident_id=i.id,event_type="created",message="Sample incident imported for demo"))
        if status=="resolved": db.add(TimelineEvent(incident_id=i.id,event_type="resolution",message="Historical resolution recorded"))
        created.append(i)
    db.commit()
    for i in created: memory.remember(i)
    return len(created)
if __name__=="__main__":
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session: print(f"Seeded {seed(session)} sample incidents")
