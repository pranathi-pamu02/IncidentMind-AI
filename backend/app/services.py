import logging
from typing import Any
import httpx
from sqlalchemy.orm import Session
from .config import settings
from .models import Incident

log=logging.getLogger("incidentmind.integrations")
class MemoryService:
    """Chroma semantic index with deterministic lexical fallback; Hindsight writes are optional."""
    def __init__(self): self.collection=None; self.client=None
    def _collection(self):
        if self.collection is not None: return self.collection
        try:
            import chromadb
            self.client=chromadb.HttpClient(host=settings.chroma_host,port=settings.chroma_port)
            self.collection=self.client.get_or_create_collection("incidentmemories",metadata={"hnsw:space":"cosine"})
        except Exception as exc: log.warning("Chroma unavailable; lexical search enabled: %s",exc)
        return self.collection
    @staticmethod
    def _text(i:Incident)->str:
        return " ".join([i.title,i.description,i.service_name,i.logs," ".join(i.tags or []),i.root_cause or "",i.resolution or "",i.engineer_notes or ""])
    def remember(self,i:Incident):
        c=self._collection()
        if c:
            try: c.upsert(ids=[str(i.id)],documents=[self._text(i)],metadatas=[{"title":i.title,"service":i.service_name,"severity":i.severity,"root_cause":i.root_cause or "","resolution":i.resolution or ""}])
            except Exception as exc: log.warning("Chroma write failed: %s",exc)
        if settings.hindsight_base_url:
            try:
                payload={"items":[{"content":f"Incident {i.id}: {self._text(i)}","context":"production incident response","document_id":f"incident-{i.id}","tags":[f"service:{i.service_name}",f"severity:{i.severity}"]}],"async":True}
                headers={"Authorization":f"Bearer {settings.hindsight_api_key}"} if settings.hindsight_api_key else {}
                url=f"{settings.hindsight_base_url.rstrip('/')}/v1/default/banks/{settings.hindsight_bank_id}/memories"
                r=httpx.post(url,json=payload,headers=headers,timeout=8); r.raise_for_status()
            except Exception as exc: log.warning("Hindsight retain failed: %s",exc)
    def search(self,query:str,db:Session,limit:int=5)->list[dict[str,Any]]:
        candidates=[]; c=self._collection()
        if c:
            try:
                result=c.query(query_texts=[query],n_results=min(limit+1,max(1,c.count())))
                for ix,doc in enumerate((result.get("documents") or [[]])[0]):
                    meta=(result.get("metadatas") or [[]])[0][ix] or {}; ident=(result.get("ids") or [[]])[0][ix]
                    candidates.append((str(ident),max(0.0,1-float((result.get("distances") or [[]])[0][ix])),meta))
            except Exception as exc: log.warning("Chroma search failed: %s",exc)
        if not candidates:
            tokens=set(query.lower().split())
            for i in db.query(Incident).all():
                text=self._text(i).lower(); overlap=len(tokens & set(text.split()))/max(1,len(tokens))
                if overlap>0: candidates.append((str(i.id),min(.92,overlap),{}))
            candidates.sort(key=lambda x:x[1],reverse=True)
        found=[]; seen=set()
        for ident,score,meta in candidates:
            i=db.get(Incident,int(ident))
            if not i or i.id in seen: continue
            seen.add(i.id)
            found.append({"id":i.id,"title":i.title,"service_name":i.service_name,"severity":i.severity,"status":i.status,"root_cause":i.root_cause,"resolution":i.resolution,"failed_attempts":i.failed_attempts or [],"similarity":round(score,3),"created_at":i.created_at.isoformat()})
        return found[:limit]
    def hindsight_context(self,query:str)->str:
        if not settings.hindsight_base_url: return ""
        try:
            headers={"Authorization":f"Bearer {settings.hindsight_api_key}"} if settings.hindsight_api_key else {}
            url=f"{settings.hindsight_base_url.rstrip('/')}/v1/default/banks/{settings.hindsight_bank_id}/memories/recall"
            r=httpx.post(url,json={"query":query,"budget":"low","max_tokens":1200},headers=headers,timeout=8); r.raise_for_status()
            return str(r.json())[:6000]
        except Exception as exc: log.warning("Hindsight recall failed: %s",exc); return ""

memory=MemoryService()
def analyze(query:str, similar:list[dict], extra_memory:str="")->dict:
    mode=settings.ai_mode.lower()
    if settings.gemini_api_key and mode!="mock":
        try:
            from google import genai
            client=genai.Client(api_key=settings.gemini_api_key)
            prompt=("You are an incident-response copilot. Ground every claim in supplied incident records. "
             "Never claim an action was executed. Warn when evidence is weak. Return JSON keys summary, root_cause, confidence, next_actions.\n"
             f"Current incident:\n{query}\nHistorical incidents:\n{similar}\nHindsight memory:\n{extra_memory}")
            response=client.models.generate_content(model=settings.gemini_model,contents=prompt,config={"response_mime_type":"application/json"})
            import json
            parsed=json.loads(response.text)
            return {"summary":str(parsed.get("summary","")),"root_cause":str(parsed.get("root_cause","Insufficient evidence; investigate further.")),"confidence":max(0,min(1,float(parsed.get("confidence",.4)))),"next_actions":[str(x) for x in parsed.get("next_actions",[])[:8]],"source":"gemini"}
        except Exception as exc: log.exception("Gemini analysis failed; using evidence-based fallback: %s",exc)
    top=similar[0] if similar else None
    if top:
        cause=top.get("root_cause") or "Historical match has no confirmed root cause."
        summary=f"Found {len(similar)} related incident(s). Closest match: {top['title']} ({int(top['similarity']*100)}% similarity)."
        actions=[f"Compare current signals with incident #{top['id']} and validate its suspected cause: {cause}"]
        if top.get("resolution"): actions.append("Review the previously recorded resolution and confirm preconditions before applying it.")
        for item in top.get("failed_attempts",[])[:2]: actions.append(f"Avoid repeating failed attempt: {item}")
        actions.append("Check service health, recent deploys, dependency status, and relevant logs; record findings.")
        return {"summary":summary,"root_cause":cause,"confidence":min(.88,top["similarity"]),"next_actions":actions,"source":"memory-fallback"}
    return {"summary":"No close historical match found. Start with current telemetry and recent change history.","root_cause":"Unknown; there is not enough incident history to infer a cause.","confidence":.12,"next_actions":["Check service health and error rates.","Inspect logs around the first failure and correlate with recent deploys.","Verify database and downstream dependency connectivity.","Capture findings and failed attempts in this incident."],"source":"memory-fallback"}
