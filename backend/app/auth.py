import time
from collections import defaultdict, deque
from datetime import datetime
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User
from .services.categorizer import seed_categories

bearer = HTTPBearer(auto_error=False)

_attempts: dict[str, deque] = defaultdict(deque)


def rate_limit(key_prefix: str, max_attempts: int, window_seconds: int):
    """Limita tentativas por IP (janela deslizante em memória)."""
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


# ---------------------------------------------------------------- verificação do token do Supabase Auth
# Login, Google e MFA (TOTP) agora são inteiramente geridos pelo Supabase Auth no browser
# (supabase-js). O backend nunca vê senha, segredo TOTP ou credencial do Google — só recebe
# o JWT de sessão já emitido pelo Supabase e confere a assinatura contra a chave pública do
# projeto (JWKS), sem precisar guardar nenhum segredo compartilhado.
@lru_cache
def _jwks_client() -> PyJWKClient:
    s = get_settings()
    return PyJWKClient(f"{s.supabase_url}/auth/v1/.well-known/jwks.json")


def _decode_supabase_jwt(token: str) -> dict:
    signing_key = _jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(token, signing_key.key, algorithms=["ES256"], audience="authenticated")


def _get_or_create_profile(db: Session, claims: dict) -> User:
    uid = claims["sub"]
    email = (claims.get("email") or "").lower()
    u = db.query(User).filter_by(supabase_uid=uid).first()
    if not u and email:
        u = db.query(User).filter_by(email=email).first()  # conta criada antes da migração pro Supabase Auth
        if u:
            u.supabase_uid = uid
    if not u:
        meta = claims.get("user_metadata") or {}
        u = User(supabase_uid=uid, email=email,
                 name=meta.get("full_name") or meta.get("name") or (email.split("@")[0] if email else "Usuário"),
                 avatar_url=meta.get("avatar_url") or meta.get("picture"),
                 lgpd_consent_at=datetime.utcnow())
        db.add(u)
        db.flush()
        seed_categories(db, u.id)
    db.commit()
    return u


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    """Sessão completa (Google + MFA confirmados no Supabase) — exigida por toda a API normal."""
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Não autenticado")
    try:
        claims = _decode_supabase_jwt(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida")
    if claims.get("aal") != "aal2":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Confirme o segundo fator de autenticação.")
    u = _get_or_create_profile(db, claims)
    if u.suspended_at:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Conta suspensa. Fale com o administrador.")
    return u


def current_admin(u: User = Depends(current_user)) -> User:
    """Sessão completa E is_admin=True — exigida pelos endpoints de administração da plataforma."""
    if not u.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso restrito a administradores.")
    return u
