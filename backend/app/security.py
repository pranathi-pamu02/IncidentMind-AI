from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from .models import User

pwd_context=CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2=OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
def hash_password(password:str)->str: return pwd_context.hash(password)
def verify_password(password:str, hashed:str)->bool: return pwd_context.verify(password,hashed)
def create_token(user:User)->str:
    now=datetime.now(timezone.utc)
    return jwt.encode({"sub":str(user.id),"iat":now,"exp":now+timedelta(minutes=settings.jwt_expire_minutes)}, settings.jwt_secret, algorithm="HS256")
def current_user(token:str|None=Depends(oauth2), db:Session=Depends(get_db))->User|None:
    if not token: return None
    try: uid=int(jwt.decode(token,settings.jwt_secret,algorithms=["HS256"])["sub"])
    except (JWTError,ValueError): raise HTTPException(401,"Invalid or expired access token",headers={"WWW-Authenticate":"Bearer"})
    user=db.get(User,uid)
    if not user: raise HTTPException(401,"Account no longer exists")
    return user
def required_user(user:User|None=Depends(current_user))->User:
    if not user: raise HTTPException(401,"Sign in required",headers={"WWW-Authenticate":"Bearer"})
    return user
