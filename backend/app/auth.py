import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)
_google_request = google_requests.Request()

_attempts: dict[str, deque] = defaultdict(deque)


def rate_limit(key_prefix: str, max_attempts: int, window_seconds: int):
    """Limita tentativas por IP (janela deslizante em memória). Protege login/registro
    de força bruta e enumeração de contas; suficiente para um único processo de app."""
    def dep(request: Request):
        ip = request.client.host if request.client else "unknown"
        q = _attempts[f"{key_prefix}:{ip}"]
        now = time.time()
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= max_attempts:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                "Muitas tentativas. Aguarde alguns minutos e tente novamente.")
        q.append(now)
    return dep


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def verify_google_credential(credential: str) -> dict:
    """Valida o ID token emitido pelo Google Identity Services e devolve os claims."""
    s = get_settings()
    if not s.google_client_id:
        raise HTTPException(400, "Login com Google não configurado (GOOGLE_CLIENT_ID ausente).")
    try:
        claims = google_id_token.verify_oauth2_token(credential, _google_request, s.google_client_id)
    except (ValueError, KeyError) as e:
        raise HTTPException(401, f"Token do Google inválido: {e}") from e
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Emissor do token inválido.")
    if not claims.get("email_verified"):
        raise HTTPException(401, "E-mail do Google não verificado.")
    return claims


def create_token(user_id: int) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=s.token_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, s.secret_key, algorithm="HS256")


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Não autenticado")
    try:
        payload = jwt.decode(creds.credentials, get_settings().secret_key, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        user = None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida")
    return user
