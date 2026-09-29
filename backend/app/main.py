import logging, uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from .config import settings
from .database import Base, engine, get_db
from .models import User, Incident, TimelineEvent, ChatMessage
from .schemas import *
from .security import hash_password, verify_password, create_token, current_user, required_user
from .services import memory, analyze

logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger=logging.getLogger("incidentmind")
@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(bind=engine)
    yield
app=FastAPI(title="IncidentMind AI",version="1.0.0",description="Incident response with searchable operational memory",lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(",")],allow_credentials=True,allow_methods=["GET","POST","PATCH","DELETE","OPTIONS"],allow_headers=["Authorization","Content-Type"])
@app.middleware("http")
async def request_context(request:Request,call_next):
    rid=request.headers.get("X-Request-ID",str(uuid.uuid4())); response=await call_next(request); response.headers["X-Request-ID"]=rid; return response
@app.exception_handler(Exception)
async def unexpected_error(request,exc):
    logger.exception("Unhandled request error path=%s",request.url.path)
    return JSONResponse(status_code=500,content={"detail":"An unexpected server error occurred","request_id":request.headers.get("X-Request-ID")})
v1="/api/v1"
@app.get("/health")
def health(): return {"status":"ok","service":"incidentmind-api"}
@app.post(v1+"/auth/register",response_model=TokenOut,status_code=201)
def register(body:RegisterIn,db:Session=Depends(get_db)):
    email=body.email.lower()
    if db.query(User).filter(func.lower(User.email)==email).first(): raise HTTPException(409,"An account with this email already exists")
    user=User(email=email,name=body.name.strip(),password_hash=hash_password(body.password)); db.add(user); db.commit(); db.refresh(user)
    return {"access_token":create_token(user),"user":user}
@app.post(v1+"/auth/login",response_model=TokenOut)
def login(body:LoginIn,db:Session=Depends(get_db)):
    user=db.query(User).filter(func.lower(User.email)==body.email.lower()).first()
    if not user or not verify_password(body.password,user.password_hash): raise HTTPException(401,"Invalid email or password")
    return {"access_token":create_token(user),"user":user}
@app.get(v1+"/auth/me",response_model=UserOut)
def me(user:User=Depends(required_user)): return user
def event(db,i,kind,message): db.add(TimelineEvent(incident_id=i.id,event_type=kind,message=message))
@app.get(v1+"/incidents",response_model=list[IncidentOut])
def list_incidents(q:str|None=None,severity:str|None=None,status:str|None=None,service:str|None=None,limit:int=Query(50,ge=1,le=200),offset:int=Query(0,ge=0),db:Session=Depends(get_db),user=Depends(required_user)):
    query=db.query(Incident)
    if q: query=query.filter(Incident.title.ilike(f"%{q}%")|Incident.description.ilike(f"%{q}%"))
    if severity: query=query.filter(Incident.severity==severity)
    if status: query=query.filter(Incident.status==status)
    if service: query=query.filter(Incident.service_name.ilike(f"%{service}%"))
    return query.order_by(Incident.created_at.desc()).offset(offset).limit(limit).all()
@app.post(v1+"/incidents",response_model=IncidentOut,status_code=201)
def create_incident(body:IncidentIn,db:Session=Depends(get_db),user=Depends(required_user)):
    i=Incident(**body.model_dump(),created_by=user.id); db.add(i); db.flush(); event(db,i,"created",f"Incident reported by {user.name}"); db.commit(); db.refresh(i); memory.remember(i); return i
@app.get(v1+"/incidents/{incident_id}")
def get_incident(incident_id:int,db:Session=Depends(get_db),user=Depends(required_user)):
    i=db.get(Incident,incident_id)
    if not i: raise HTTPException(404,"Incident not found")
    return {**IncidentOut.model_validate(i).model_dump(),"timeline":[{"id":e.id,"event_type":e.event_type,"message":e.message,"created_at":e.created_at} for e in i.timeline]}
@app.patch(v1+"/incidents/{incident_id}",response_model=IncidentOut)
def update_incident(incident_id:int,body:IncidentUpdate,db:Session=Depends(get_db),user=Depends(required_user)):
    i=db.get(Incident,incident_id)
    if not i: raise HTTPException(404,"Incident not found")
    changes=body.model_dump(exclude_unset=True)
    for key,value in changes.items(): setattr(i,key,value)
    if "status" in changes: event(db,i,"status",f"Status changed to {changes['status']} by {user.name}")
    if "resolution" in changes: event(db,i,"resolution","Resolution details updated")
    db.commit(); db.refresh(i); memory.remember(i); return i
@app.delete(v1+"/incidents/{incident_id}",status_code=204)
def delete_incident(incident_id:int,db:Session=Depends(get_db),user=Depends(required_user)):
    i=db.get(Incident,incident_id)
    if not i: raise HTTPException(404,"Incident not found")
    c=memory._collection()
    if c:
        try: c.delete(ids=[str(i.id)])
        except Exception: pass
    db.delete(i); db.commit()
@app.get(v1+"/incidents/{incident_id}/timeline")
def timeline(incident_id:int,db:Session=Depends(get_db),user=Depends(required_user)):
    if not db.get(Incident,incident_id): raise HTTPException(404,"Incident not found")
    return db.query(TimelineEvent).filter_by(incident_id=incident_id).order_by(TimelineEvent.created_at).all()
def incident_query(i): return f"{i.title}\n{i.description}\n{i.service_name}\n{i.logs}\nTags: {', '.join(i.tags or [])}"
@app.get(v1+"/incidents/{incident_id}/similar")
def similar(incident_id:int,limit:int=Query(5,ge=1,le=20),db:Session=Depends(get_db),user=Depends(required_user)):
    i=db.get(Incident,incident_id)
    if not i: raise HTTPException(404,"Incident not found")
    return [row for row in memory.search(incident_query(i),db,limit+1) if row["id"]!=i.id][:limit]
@app.post(v1+"/incidents/{incident_id}/analyze",response_model=AnalysisOut)
def incident_analysis(incident_id:int,db:Session=Depends(get_db),user=Depends(required_user)):
    i=db.get(Incident,incident_id)
    if not i: raise HTTPException(404,"Incident not found")
    similar_rows=[row for row in memory.search(incident_query(i),db,6) if row["id"]!=i.id][:5]
    context=memory.hindsight_context(incident_query(i)); result=analyze(incident_query(i),similar_rows,context); result["similar_incidents"]=similar_rows; return result
@app.post(v1+"/search")
def search(body:SearchIn,db:Session=Depends(get_db),user=Depends(required_user)):
    return memory.search(body.query,db,body.limit)
@app.get(v1+"/dashboard")
def dashboard(db:Session=Depends(get_db),user=Depends(required_user)):
    total=db.query(func.count(Incident.id)).scalar() or 0
    severity={key:db.query(func.count(Incident.id)).filter(Incident.severity==key).scalar() or 0 for key in ["critical","high","medium","low"]}
    statuses={key:db.query(func.count(Incident.id)).filter(Incident.status==key).scalar() or 0 for key in ["open","investigating","mitigated","resolved"]}
    recent=db.query(Incident).order_by(Incident.created_at.desc()).limit(6).all()
    services=db.query(Incident.service_name,func.count(Incident.id)).group_by(Incident.service_name).order_by(func.count(Incident.id).desc()).limit(6).all()
    resolved=db.query(func.count(Incident.id)).filter(Incident.status=="resolved").scalar() or 0
    return {"total_incidents":total,"open_incidents":statuses["open"]+statuses["investigating"],"resolved_incidents":resolved,"resolution_rate":round(resolved*100/total) if total else 0,"severity":severity,"statuses":statuses,"recent":[IncidentOut.model_validate(x).model_dump() for x in recent],"services":[{"name":s,"count":n} for s,n in services]}
@app.get(v1+"/history")
def history(limit:int=Query(100,ge=1,le=200),db:Session=Depends(get_db),user=Depends(required_user)):
    return db.query(Incident).filter((Incident.root_cause.isnot(None))|(Incident.resolution.isnot(None))).order_by(Incident.updated_at.desc()).limit(limit).all()
@app.get(v1+"/chat/history")
def chat_history(db:Session=Depends(get_db),user=Depends(required_user)):
    return db.query(ChatMessage).filter(ChatMessage.user_id==user.id).order_by(ChatMessage.created_at).limit(100).all()
@app.post(v1+"/chat",response_model=ChatOut)
def chat(body:ChatIn,db:Session=Depends(get_db),user=Depends(required_user)):
    incident=db.get(Incident,body.incident_id) if body.incident_id else None
    if body.incident_id and not incident: raise HTTPException(404,"Incident not found")
    refs=memory.search((incident_query(incident)+"\n" if incident else "")+body.message,db,5)
    result=analyze(body.message,refs,memory.hindsight_context(body.message))
    answer=result["summary"]+"\n\nLikely cause: "+result["root_cause"]+"\n\nSuggested checks:\n"+"\n".join(f"• {x}" for x in result["next_actions"])
    if incident: answer="Context: "+incident.title+"\n\n"+answer
    db.add(ChatMessage(user_id=user.id,role="user",content=body.message)); db.add(ChatMessage(user_id=user.id,role="assistant",content=answer)); db.commit()
    return {"answer":answer,"references":refs}
