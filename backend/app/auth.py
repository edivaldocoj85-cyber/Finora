import json
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import pyotp
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


# ---------------------------------------------------------------- MFA (TOTP + códigos de backup)
def new_mfa_secret() -> str:
    return pyotp.random_base32()


def mfa_provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="Finora")


def verify_totp(secret: str, code: str) -> bool:
    code = (code or "").strip().replace(" ", "")
    return bool(secret) and len(code) == 6 and code.isdigit() and pyotp.TOTP(secret).verify(code, valid_window=1)


def new_backup_codes(n: int = 8) -> list[str]:
    """Códigos de uso único pra quando a pessoa perde o app autenticador — sem isso,
    MFA obrigatório pode trancar alguém pra sempre fora dos próprios dados."""
    return ["-".join([secrets.token_hex(2), secrets.token_hex(2)]) for _ in range(n)]


def hash_backup_codes(codes: list[str]) -> str:
    return json.dumps([hash_password(c) for c in codes])


def consume_backup_code(stored_json: str | None, code: str) -> str | None:
    """Confere o código contra os hashes guardados; se bater, devolve o JSON já sem
    aquele código (uso único). None se não achou ou não tinha nada guardado."""
    if not stored_json:
        return None
    hashes = json.loads(stored_json)
    code = (code or "").strip().lower()
    for h in hashes:
        try:
            if bcrypt.checkpw(code.encode(), h.encode()):
                hashes.remove(h)
                return json.dumps(hashes)
        except ValueError:
            continue
    return None


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


def create_token(user_id: int, scope: str = "full") -> str:
    """scope="full" é a sessão normal; scope="mfa_pending" só serve pra completar o
    segundo fator (janela curta — 10 min — porque não dá acesso a nada além disso)."""
    s = get_settings()
    minutes = s.token_expire_minutes if scope == "full" else 10
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode({"sub": str(user_id), "scope": scope, "exp": exp}, s.secret_key, algorithm="HS256")


def _authed_user(creds: HTTPAuthorizationCredentials | None, db: Session, required_scope: str) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Não autenticado")
    try:
        payload = jwt.decode(creds.credentials, get_settings().secret_key, algorithms=["HS256"])
        if payload.get("scope") != required_scope:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida")
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        user = None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida")
    if required_scope == "full" and user.suspended_at:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Conta suspensa. Fale com o administrador.")
    return user


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    """Sessão completa (Google + MFA já confirmados) — exigida por toda a API normal."""
    return _authed_user(creds, db, "full")


def current_admin(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                  db: Session = Depends(get_db)) -> User:
    """Sessão completa E is_admin=True — exigida pelos endpoints de administração da plataforma."""
    user = _authed_user(creds, db, "full")
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso restrito a administradores.")
    return user


def current_user_mfa_pending(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                             db: Session = Depends(get_db)) -> User:
    """Só passou pelo Google, ainda não confirmou o segundo fator — só os endpoints
    de configurar/verificar MFA aceitam esse token."""
    return _authed_user(creds, db, "mfa_pending")
