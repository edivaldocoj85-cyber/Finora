import os
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from functools import lru_cache

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import SharedAccess, User
from .services.categorizer import seed_categories

bearer = HTTPBearer(auto_error=False)

_attempts: dict[str, deque] = defaultdict(deque)


def rate_limit(key_prefix: str, max_attempts: int, window_seconds: int):
    """Limita tentativas por IP (janela deslizante em memória)."""
    def dep(request: Request):
        # na Vercel a conexão chega pelo proxy (todo mundo teria o mesmo IP); o x-real-ip é
        # definido pela própria Vercel. Em Docker, o uvicorn já roda com --proxy-headers.
        ip = (request.headers.get("x-real-ip") if os.environ.get("VERCEL") else None) \
            or (request.client.host if request.client else "unknown")
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
                 lgpd_consent_at=datetime.utcnow(),
                 plan="trial", trial_ends_at=datetime.utcnow() + timedelta(days=10))
        db.add(u)
        db.flush()
        seed_categories(db, u.id)
    db.commit()
    return u


def workspaces_of(db: Session, u: User) -> list[dict]:
    """Espaços de dados que a pessoa pode abrir: os próprios (pessoal + empresas que criou)
    e os que aceitou por convite (com o papel de cada um)."""
    out = [{"id": u.id, "name": "Pessoal", "kind": "pf", "role": "owner", "entity": False, "shared": False, "document": ""}]
    for e in db.query(User).filter_by(owner_user_id=u.id).order_by(User.name):
        out.append({"id": e.id, "name": e.name, "kind": e.entity_kind or "pj", "role": "owner", "entity": True,
                    "shared": False, "document": e.document or ""})
    shares = (db.query(SharedAccess).filter_by(member_id=u.id, revoked_at=None)
              .filter(SharedAccess.accepted_at.isnot(None)).all())
    for s in shares:
        o = db.get(User, s.owner_id)
        if o:
            out.append({"id": o.id, "name": o.name if o.owner_user_id else f"{o.name} (compartilhado)",
                        "kind": o.entity_kind or "pf", "role": s.role, "entity": bool(o.owner_user_id),
                        "shared": True, "document": o.document or "", "share_id": s.id,
                        "cost_center_ids": _cc_list(getattr(s, "cost_center_ids", None))})
    return out


def _cc_list(v) -> list[int]:
    return [int(x) for x in str(v or "").split(",") if x.strip().isdigit()]


def _resolve_workspace(db: Session, u: User, requested: int | None = None) -> None:
    """Anexa workspace_id/workspace_role ao objeto em memória (atributos transientes, não
    mapeados — nunca persistem): se o usuário aceitou um convite de acesso compartilhado
    ainda ativo, os dados a consultar são os do dono do convite (`owner_id`); senão são os
    próprios. Resolvido a cada request a partir do banco, então revogar um convite tira o
    acesso já no próximo pedido, sem precisar de logout."""
    spaces = workspaces_of(db, u)
    pick = next((w for w in spaces if w["id"] == requested), None) if requested else None
    if not pick:
        # sem escolha (ou escolha sem permissão): como era antes — o convite aceito, senão o próprio
        pick = next((w for w in spaces if w["shared"]), spaces[0])
    u.workspace_id = pick["id"]
    u.workspace_role = pick["role"]
    u.workspace_name = pick["name"]
    u.workspace_entity = pick["entity"]
    u.workspace_cc = pick.get("cost_center_ids") or []  # acesso restrito a centros de custo (vazio = tudo)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db), x_workspace: str | None = Header(None)) -> User:
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
    if u.owner_user_id:  # empresa não tem login próprio
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Conta inválida.")
    _resolve_workspace(db, u, int(x_workspace) if (x_workspace or "").isdigit() else None)
    return u


# quem tem acesso restrito a centros de custo só usa lançamentos e o relatório por centro
_CC_ALLOWED = (("GET", "/api/me"), ("PATCH", "/api/me"), ("GET", "/api/workspaces"), ("*", "/api/transactions"),
               ("GET", "/api/categories"), ("GET", "/api/accounts"), ("GET", "/api/cost-centers"),
               ("GET", "/api/reports/cost-centers"), ("GET", "/api/tags"), ("*", "/api/shared-access"))
_CC_BLOCKED = ("/api/transactions/import", "/api/transactions/export")


def _cc_path_ok(method: str, path: str) -> bool:
    if any(path.startswith(b) for b in _CC_BLOCKED):
        return False
    return any((m == "*" or m == method) and (path == p or path.startswith(p + "/") or path.startswith(p + "?"))
               for m, p in _CC_ALLOWED)


def current_user_active(request: Request, u: User = Depends(current_user)) -> User:
    """current_user + teste grátis ainda válido (ou plano pago, ou admin). Usado nos
    endpoints que de fato dão acesso ao produto — /me continua em current_user puro, pra
    o front sempre conseguir saber o status da conta mesmo com o teste vencido. Quem está
    acessando os dados de outra pessoa via acesso compartilhado nunca é bloqueado pelo
    próprio teste/plano — quem paga é o dono do workspace, não cada convidado."""
    if (u.workspace_role == "owner" and not u.is_admin and u.plan == "trial"
            and u.trial_ends_at and datetime.utcnow() > u.trial_ends_at):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Seu período de teste acabou.")
    if getattr(u, "workspace_cc", None) and not _cc_path_ok(request.method, request.url.path):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seu acesso é só aos lançamentos dos seus centros de custo.")
    return u


def current_editor(u: User = Depends(current_user_active)) -> User:
    """current_user_active, mas bloqueia quem só tem papel `viewer` num acesso
    compartilhado — usado em todo endpoint que grava ou apaga dado do workspace."""
    if u.workspace_role == "viewer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Você tem acesso somente leitura a esses dados.")
    return u


def current_admin(u: User = Depends(current_user)) -> User:
    """Sessão completa E is_admin=True — exigida pelos endpoints de administração da plataforma."""
    if not u.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso restrito a administradores.")
    return u
