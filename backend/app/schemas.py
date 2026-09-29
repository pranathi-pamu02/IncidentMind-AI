from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10, max_length=72)
class LoginIn(BaseModel): email: EmailStr; password: str
class UserOut(BaseModel): model_config=ConfigDict(from_attributes=True); id: int; email: str; name: str
class TokenOut(BaseModel): access_token: str; token_type: str="bearer"; user: UserOut
class IncidentIn(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    description: str = Field(min_length=10, max_length=10000)
    severity: Literal["critical","high","medium","low"]
    service_name: str = Field(min_length=1, max_length=120)
    logs: str = Field(default="", max_length=30000)
    tags: list[str] = Field(default_factory=list, max_length=20)
class IncidentUpdate(BaseModel):
    status: Literal["open","investigating","mitigated","resolved"] | None = None
    root_cause: str | None = Field(default=None, max_length=10000)
    resolution: str | None = Field(default=None, max_length=10000)
    failed_attempts: list[str] | None = Field(default=None, max_length=50)
    outcome: str | None = None
    engineer_notes: str | None = Field(default=None, max_length=10000)
class IncidentOut(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id:int; title:str; description:str; severity:str; service_name:str; logs:str; tags:list
    status:str; root_cause:str|None; resolution:str|None; failed_attempts:list; outcome:str|None
    engineer_notes:str; created_at:datetime; updated_at:datetime
class AnalysisOut(BaseModel): summary:str; root_cause:str; confidence:float; next_actions:list[str]; similar_incidents:list[dict]; source:str
class ChatIn(BaseModel): message:str=Field(min_length=1,max_length=4000); incident_id:int|None=None
class ChatOut(BaseModel): answer:str; references:list[dict]
class SearchIn(BaseModel): query:str=Field(min_length=1,max_length=4000); limit:int=Field(default=5,ge=1,le=20)
