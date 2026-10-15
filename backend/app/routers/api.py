import csv
import hashlib
import hmac
import io
import re
import time
from datetime import date, datetime, timedelta
from typing import Optional

# Alias só pra anotar campos Pydantic chamados "date": quando um campo tem esse nome E um
# valor padrão, o pydantic resolve o type hint olhando o namespace da própria classe antes
# do módulo, acha o atributo "date" (o default, não o tipo) e trata o campo como só-None.
# Usar esse alias na anotação evita a colisão de nome sem precisar renomear o campo.
_Date = date

import httpx
from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Path, Query, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..auth import current_admin, current_editor, current_user, current_user_active, rate_limit
from ..config import get_settings
from ..db import get_db, SessionLocal
from ..models import (Account, AdvisorReport, Alert, Asset, Category, CategoryRule, Contract, CostCenter,
                      Goal, Income, Investment, InvestmentEvent, InvestmentTrade, PluggyItem,
                      PortfolioSnapshot, Pot, PotMove, Receivable, SharedAccess, Transaction, User,
                      WaitlistSignup)
from ..services import (advisor, analytics, assistant, cashflow, market, notifications, pluggy, portfolio, pots, recurring,
                        statement_import, storage, vendas)
from ..services import email as email_service
from ..services.categorizer import categorize, seed_categories

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------- perfil
# Login, Google e MFA são geridos pelo Supabase Auth (supabase-js, direto no browser) —
# ver ../auth.py. O backend só lê o token de sessão já emitido; não existe mais endpoint
# de login/registro/MFA aqui.
def user_out(u: User, db: Session):
    trial_expired = bool(u.workspace_id == u.id and not u.is_admin and u.plan == "trial"
                         and u.trial_ends_at and datetime.utcnow() > u.trial_ends_at)
    workspace_owner = None
    if u.workspace_id != u.id:
        owner = db.get(User, u.workspace_id)
        workspace_owner = {"name": owner.name, "email": owner.email} if owner else None
    return {"id": u.id, "name": u.name, "email": u.email, "plan": u.plan,
            "monthly_goal_savings": u.monthly_goal_savings, "avatar_url": u.avatar_url,
            "email_alerts": u.email_alerts is not False, "email_digest": u.email_digest or "weekly",
            "email_enabled": email_service.enabled(),
            "onboarded": bool(u.onboarded_at), "is_admin": u.is_admin,
            "trial_ends_at": u.trial_ends_at.isoformat() if u.trial_ends_at else None,
            "trial_expired": trial_expired,
            "workspace_role": u.workspace_role, "workspace_owner": workspace_owner}


# ---------------------------------------------------------------- acesso antecipado (landing pública)
# Único endpoint sem autenticação que grava algo no banco — protegido por limite de taxa
# por IP pra não virar um jeito barato de floodar a tabela.
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class WaitlistIn(BaseModel):
    email: str = Field(min_length=5, max_length=180)


@router.post("/acesso", dependencies=[Depends(rate_limit("acesso", 8, 300))])
def pedir_acesso(data: WaitlistIn, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if not _EMAIL_RE.match(email):
        return {"ok": False, "erro": "Esse e-mail não parece válido."}
    if db.query(WaitlistSignup).filter_by(email=email).first():
        return {"ok": False, "erro": "Esse e-mail já está na lista de espera."}
    db.add(WaitlistSignup(email=email))
    db.commit()
    return {"ok": True}


# Chat de pré-venda da landing (sem login). Não grava nada; o limite por IP protege o custo
# da camada de IA e o tamanho da conversa é cortado aqui, antes de qualquer processamento.
class VendasMsg(BaseModel):
    papel: str = Field(pattern="^(eu|nora)$")
    texto: str = Field(min_length=1, max_length=2000)


class VendasIn(BaseModel):
    mensagens: list[VendasMsg] = Field(min_length=1, max_length=40)


@router.post("/vendas/chat", dependencies=[Depends(rate_limit("vendas", 30, 600))])
def chat_vendas(data: VendasIn):
    historico = [{"papel": m.papel, "texto": m.texto.strip()[:600]} for m in data.mensagens[-12:]]
    if historico[-1]["papel"] != "eu" or not historico[-1]["texto"]:
        raise HTTPException(400, "A última mensagem precisa ser a pergunta do visitante.")
    return vendas.responder(historico)


# ---------------------------------------------------------------- admin (backoffice da plataforma)
# Restrito a usuários com is_admin=True. Não existe cadastro de admin pela UI — é promovido
# diretamente no banco (ou por outro admin) para evitar qualquer caminho de auto-promoção.
# Suspensão/MFA de fato são impostos pela Admin API do Supabase (GoTrue) — o campo local
# `suspended_at` é só um espelho pra listar rápido sem round-trip extra por usuário.
def _gotrue_headers() -> dict:
    key = get_settings().supabase_service_key
    return {"Authorization": f"Bearer {key}", "apikey": key}


def _gotrue_ban(supabase_uid: str, ban: bool) -> None:
    s = get_settings()
    r = httpx.put(f"{s.supabase_url}/auth/v1/admin/users/{supabase_uid}",
                  headers=_gotrue_headers(), json={"ban_duration": "876000h" if ban else "none"}, timeout=15)
    if r.status_code >= 300:
        raise HTTPException(502, f"Falha ao atualizar usuário no Supabase: {r.status_code} {r.text[:200]}")


def _gotrue_reset_mfa(supabase_uid: str) -> None:
    s = get_settings()
    r = httpx.get(f"{s.supabase_url}/auth/v1/admin/users/{supabase_uid}", headers=_gotrue_headers(), timeout=15)
    if r.status_code >= 300:
        raise HTTPException(502, f"Falha ao buscar usuário no Supabase: {r.status_code} {r.text[:200]}")
    for factor in r.json().get("factors") or []:
        httpx.delete(f"{s.supabase_url}/auth/v1/admin/users/{supabase_uid}/factors/{factor['id']}",
                     headers=_gotrue_headers(), timeout=15)


def admin_user_out(u: User, db: Session):
    return {
        "id": u.id, "name": u.name, "email": u.email, "plan": u.plan, "is_admin": u.is_admin,
        "avatar_url": u.avatar_url, "created_at": u.created_at.isoformat() if u.created_at else None,
        "onboarded": bool(u.onboarded_at), "linked": bool(u.supabase_uid),
        "suspended_at": u.suspended_at.isoformat() if u.suspended_at else None,
        "trial_ends_at": u.trial_ends_at.isoformat() if u.trial_ends_at else None,
        "accounts_count": db.query(Account).filter_by(user_id=u.id).count(),
        "transactions_count": db.query(Transaction).filter_by(user_id=u.id).count(),
    }


class PlanIn(BaseModel):
    plan: str = Field(pattern="^(trial|free|pro)$")
    extend_trial_days: Optional[int] = Field(None, ge=1, le=365)


@router.post("/admin/users/{uid}/plan")
def admin_set_plan(uid: int, data: PlanIn, admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    """Marca manualmente o plano de alguém — usado depois de um pagamento fora do sistema
    (Pix, transferência etc.), já que ainda não tem gateway de cobrança integrado."""
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    u.plan = data.plan
    if data.extend_trial_days:
        base = u.trial_ends_at if (u.trial_ends_at and u.trial_ends_at > datetime.utcnow()) else datetime.utcnow()
        u.trial_ends_at = base + timedelta(days=data.extend_trial_days)
    elif data.plan != "trial":
        u.trial_ends_at = None
    db.commit()
    return admin_user_out(u, db)


@router.get("/admin/users")
def admin_list_users(q: Optional[str] = None, admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    query = db.query(User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.name.ilike(like), User.email.ilike(like)))
    users = query.order_by(User.created_at.desc()).all()
    return [admin_user_out(u, db) for u in users]


@router.post("/admin/users/{uid}/role")
def admin_set_role(uid: int, is_admin: bool = Body(..., embed=True),
                   admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    if u.id == admin.id and not is_admin:
        raise HTTPException(400, "Você não pode remover seu próprio acesso de administrador.")
    u.is_admin = is_admin
    db.commit()
    return admin_user_out(u, db)


@router.post("/admin/users/{uid}/suspend")
def admin_suspend_user(uid: int, admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    if u.id == admin.id:
        raise HTTPException(400, "Você não pode suspender a própria conta.")
    if u.supabase_uid:
        _gotrue_ban(u.supabase_uid, ban=True)  # bloqueia de fato na camada de autenticação
    u.suspended_at = datetime.utcnow()
    db.commit()
    return admin_user_out(u, db)


@router.post("/admin/users/{uid}/reactivate")
def admin_reactivate_user(uid: int, admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    if u.supabase_uid:
        _gotrue_ban(u.supabase_uid, ban=False)
    u.suspended_at = None
    db.commit()
    return admin_user_out(u, db)


@router.post("/admin/users/{uid}/reset-mfa")
def admin_reset_mfa(uid: int, admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    """Remove o(s) fator(es) TOTP do usuário no Supabase — no próximo login ele precisa
    fazer o enroll de novo. Usar quando a pessoa perdeu o autenticador e ficou trancada
    para sempre fora da própria conta (o Supabase Auth não tem código de backup nativo)."""
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    if not u.supabase_uid:
        raise HTTPException(400, "Esse usuário ainda não fez login pelo Supabase — não há MFA pra resetar.")
    _gotrue_reset_mfa(u.supabase_uid)
    return admin_user_out(u, db)


@router.get("/me")
def me(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_out(u, db)


class MeIn(BaseModel):
    name: Optional[str] = None
    monthly_goal_savings: Optional[float] = None
    email_alerts: Optional[bool] = None
    email_digest: Optional[str] = Field(None, pattern="^(weekly|none)$")


@router.patch("/me")
def update_me(data: MeIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(u, k, v)
    db.merge(u)
    db.commit()
    return user_out(u, db)


@router.post("/me/digest-test")
def send_test_digest(u: User = Depends(current_user_active), db: Session = Depends(get_db),
                     _rl=Depends(rate_limit("digest-test", 3, 3600))):
    """Manda o resumo semanal agora, pro próprio e-mail, pra pessoa ver como fica."""
    if not email_service.enabled():
        raise HTTPException(400, "O envio de e-mail não está configurado no servidor (RESEND_API_KEY).")
    if not notifications.send_digest(db, u):
        raise HTTPException(502, "Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.")
    return {"ok": True, "to": u.email}


@router.post("/me/onboarded")
def mark_onboarded(u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Marca o assistente de primeiro acesso como concluído (ou pulado)."""
    u.onboarded_at = datetime.utcnow()
    db.merge(u)
    db.commit()
    return user_out(u, db)


@router.delete("/me")
def delete_me(u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Direito de exclusão (LGPD): remove o usuário, seus dados e os itens na Pluggy."""
    for it in db.query(PluggyItem).filter_by(user_id=u.id):
        pluggy.delete_item(it.item_id)
    for (path,) in db.query(Transaction.receipt_path).filter(Transaction.user_id == u.id,
                                                            Transaction.receipt_path.isnot(None)):
        storage.delete(path)  # arquivos no disco/Supabase Storage não saem com o DELETE do banco
    for M in (Transaction, CategoryRule, Contract, Income, Goal, Alert, AdvisorReport, PluggyItem,
              Account, Category):
        db.query(M).filter_by(user_id=u.id).delete()
    db.query(User).filter_by(id=u.id).delete()
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- acesso compartilhado
# Quem aceita um convite passa a ver e editar os dados do dono (`owner_id`) em vez dos
# próprios — sócio(a), cônjuge ou contador acompanhando a mesma conta. Cada pessoa só pode
# estar em UM workspace emprestado por vez; quem convida precisa estar operando como dono
# (não pode convidar gente pra dentro de um workspace que ela própria só está visitando).
class ShareIn(BaseModel):
    email: str = Field(min_length=5, max_length=180)
    role: str = Field("editor", pattern="^(editor|viewer)$")


def share_out(s: SharedAccess, db: Session) -> dict:
    member = db.get(User, s.member_id) if s.member_id else None
    return {"id": s.id, "email": s.member_email, "role": s.role,
            "invited_at": s.invited_at.isoformat(),
            "accepted_at": s.accepted_at.isoformat() if s.accepted_at else None,
            "member_name": member.name if member else None}


@router.get("/shared-access")
def list_shared_access(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    rows = (db.query(SharedAccess).filter_by(owner_id=u.id, revoked_at=None)
            .order_by(SharedAccess.invited_at.desc()).all())
    return [share_out(s, db) for s in rows]


@router.post("/shared-access")
def invite_shared_access(data: ShareIn, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    """Convida alguém, por e-mail, a acessar os mesmos dados financeiros. A pessoa precisa
    ter (ou criar) uma conta no Finora com esse e-mail e aceitar o convite pra passar a ver
    os dados — nada muda pra ela antes disso."""
    if u.workspace_id != u.id:
        raise HTTPException(400, "Você está vendo os dados de outra pessoa — só quem é dono da conta pode convidar.")
    email = data.email.strip().lower()
    if email == u.email.lower():
        raise HTTPException(400, "Você não pode convidar a si mesmo.")
    if db.query(SharedAccess).filter_by(owner_id=u.id, revoked_at=None).count() >= 5:
        raise HTTPException(400, "Limite de 5 pessoas com acesso compartilhado por conta.")
    if db.query(SharedAccess).filter_by(owner_id=u.id, member_email=email, revoked_at=None).first():
        raise HTTPException(400, "Esse e-mail já tem um convite ativo.")
    s = SharedAccess(owner_id=u.id, member_email=email, role=data.role)
    db.add(s)
    db.commit()
    return share_out(s, db)


@router.delete("/shared-access/{sid}")
def revoke_shared_access(sid: int, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    """Revoga um convite pendente ou tira o acesso de quem já tinha aceitado — some no
    próximo pedido da pessoa, sem precisar dela deslogar."""
    s = db.query(SharedAccess).filter_by(id=sid, owner_id=u.id, revoked_at=None).first()
    if not s:
        raise HTTPException(404, "Convite não encontrado.")
    s.revoked_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/shared-access/invitations")
def list_invitations(u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Convites pendentes de aceite endereçados ao e-mail de quem está logado."""
    rows = db.query(SharedAccess).filter_by(member_email=u.email.lower(), accepted_at=None, revoked_at=None).all()
    out = []
    for s in rows:
        owner = db.get(User, s.owner_id)
        out.append({"id": s.id, "role": s.role, "owner_name": owner.name if owner else "?",
                    "owner_email": owner.email if owner else "", "invited_at": s.invited_at.isoformat()})
    return out


@router.post("/shared-access/{sid}/accept")
def accept_shared_access(sid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = (db.query(SharedAccess)
         .filter_by(id=sid, member_email=u.email.lower(), accepted_at=None, revoked_at=None).first())
    if not s:
        raise HTTPException(404, "Convite não encontrado ou já respondido.")
    already = (db.query(SharedAccess).filter_by(member_id=u.id, revoked_at=None)
               .filter(SharedAccess.accepted_at.isnot(None)).first())
    if already:
        raise HTTPException(400, "Você já está vendo os dados de outra conta — saia desse acesso antes de aceitar um novo.")
    s.member_id = u.id
    s.accepted_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/shared-access/{sid}/decline")
def decline_shared_access(sid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = (db.query(SharedAccess)
         .filter_by(id=sid, member_email=u.email.lower(), accepted_at=None, revoked_at=None).first())
    if not s:
        raise HTTPException(404, "Convite não encontrado.")
    s.revoked_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/shared-access/leave")
def leave_shared_access(u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = (db.query(SharedAccess).filter_by(member_id=u.id, revoked_at=None)
         .filter(SharedAccess.accepted_at.isnot(None)).first())
    if not s:
        raise HTTPException(400, "Você não está com acesso compartilhado de ninguém no momento.")
    s.revoked_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- CRUD genérico
def to_dict(obj):
    d = {}
    for c in obj.__table__.columns:
        v = getattr(obj, c.name)
        d[c.name] = v.isoformat() if isinstance(v, (date, datetime)) else v
    return d


class AccountIn(BaseModel):
    name: str
    kind: str = "checking"
    institution: str = ""
    balance: float = 0
    credit_limit: float = 0
    closing_day: Optional[int] = Field(None, ge=1, le=31)
    due_day: Optional[int] = Field(None, ge=1, le=31)
    color: str = "#0ea5e9"
    archived: bool = False
    import_reminder: str = "none"  # none|daily|weekly|monthly


class CategoryIn(BaseModel):
    name: str
    kind: str = "expense"
    color: str = "#6366f1"
    icon: str = "tag"
    monthly_budget: float = 0
    essential: bool = False


class RuleIn(BaseModel):
    pattern: str = Field(min_length=2)
    category_id: int
    priority: int = 0
    apply_existing: bool = True


class ContractIn(BaseModel):
    name: str
    provider: str = ""
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    amount: float
    due_day: int = Field(10, ge=1, le=31)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    total_installments: Optional[int] = None
    interest_rate_month: float = 0
    adjustment_index: str = ""
    active: bool = True
    notes: str = ""
    kind: str = Field("contract", pattern="^(contract|subscription|rent|financing|insurance|service)$")
    adjustment_month: Optional[int] = Field(None, ge=1, le=12)
    last_adjusted_at: Optional[date] = None
    renewal_date: Optional[date] = None
    cancel_notice_days: int = Field(0, ge=0, le=365)


class ReceivableIn(BaseModel):
    client_name: str
    description: str = ""
    account_id: Optional[int] = None
    amount: float = Field(gt=0)
    due_date: date
    notes: str = ""


class IncomeIn(BaseModel):
    name: str
    kind: str = "salary"
    person_type: str = "PF"
    gross_amount: float = 0
    net_amount: float
    pay_day: int = Field(5, ge=1, le=31)
    recurring: bool = True
    active: bool = True


class GoalIn(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0
    deadline: Optional[date] = None
    kind: str = "custom"  # custom | emergency_fund
    months_target: Optional[float] = None
    monthly_cost: Optional[float] = None


class AssetIn(BaseModel):
    name: str
    kind: str = "outro"  # imovel | veiculo | outro
    value: float = Field(ge=0)
    vehicle_fipe_code: Optional[str] = None
    notes: str = Field("", max_length=300)


class TransactionIn(BaseModel):
    account_id: int
    to_account_id: Optional[int] = None  # obrigatório quando type="transfer"
    category_id: Optional[int] = None
    date: date
    description: str
    amount: float = Field(gt=0)
    type: str = "expense"
    installments: int = Field(1, ge=1, le=48)  # compra parcelada no cartão
    notes: str = ""
    cost_center_id: Optional[int] = None  # 0 ou vazio = sem centro de custo
    tags: list[str] = []


def _tags_in(tags) -> str:
    """["Viagem", " casamento "] → ",viagem,casamento," (minúsculas, sem repetir, até 10)."""
    out = []
    for t in tags or []:
        t = re.sub(r"\s+", " ", str(t).replace(",", " ")).strip().lower()[:30]
        if t and t not in out:
            out.append(t)
    return ("," + ",".join(out[:10]) + ",") if out else ""


def _tags_out(s: str | None) -> list[str]:
    return [t for t in (s or "").split(",") if t]


def _check_fk(db, user_id, model, id_):
    if id_ is not None and not db.query(model).filter_by(id=id_, user_id=user_id).first():
        raise HTTPException(400, f"{model.__name__} inválido")


def _adjust_balance(db, account_id, tx_date, delta, sign=1):
    """Aplica (sign=1) ou reverte (sign=-1) um efeito de caixa no saldo de uma conta.
    Cartão de crédito não guarda saldo por transação manual (fatura é calculada à parte);
    contas conectadas via Open Finance têm o saldo corrigido a cada sincronização com o
    banco, então ajustes manuais aqui seriam sobrescritos de qualquer forma — não fazem mal,
    mas também não são a fonte de verdade. Lançamento com data futura (parcela ainda não
    vencida) não deve afetar o saldo hoje."""
    if not account_id or delta == 0 or tx_date > date.today():
        return
    acc = db.get(Account, account_id)
    if not acc or acc.kind == "credit_card":
        return
    acc.balance += sign * delta


def _tx_balance_effect(t) -> list[tuple[int, float]]:
    """(account_id, delta) de cada perna de uma transação: receita credita, despesa
    debita, transferência debita a origem e credita o destino."""
    if t.type == "income":
        return [(t.account_id, t.amount)]
    if t.type == "expense":
        return [(t.account_id, -t.amount)]
    if t.type == "transfer" and t.to_account_id:
        return [(t.account_id, -t.amount), (t.to_account_id, t.amount)]
    return []


def _apply_tx_effect(db, t, sign=1):
    for account_id, delta in _tx_balance_effect(t):
        _adjust_balance(db, account_id, t.date, delta, sign)


def crud(path: str, Model, Schema, fks: dict | None = None, order=None):
    fks = fks or {}

    @router.get(f"/{path}", name=f"list_{path}")
    def _list(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
        q = db.query(Model).filter_by(user_id=u.workspace_id)
        if order is not None:
            q = q.order_by(order)
        return [to_dict(o) for o in q.all()]

    @router.post(f"/{path}", name=f"create_{path}")
    def _create(data: Schema, u: User = Depends(current_editor), db: Session = Depends(get_db)):
        vals = data.model_dump()
        for f, M in fks.items():
            _check_fk(db, u.workspace_id, M, vals.get(f))
        o = Model(user_id=u.workspace_id, **vals)
        db.add(o)
        db.commit()
        return to_dict(o)

    @router.put(f"/{path}/{{oid}}", name=f"update_{path}")
    def _update(oid: int, data: Schema, u: User = Depends(current_editor), db: Session = Depends(get_db)):
        o = db.query(Model).filter_by(id=oid, user_id=u.workspace_id).first()
        if not o:
            raise HTTPException(404, "Não encontrado")
        vals = data.model_dump()
        for f, M in fks.items():
            _check_fk(db, u.workspace_id, M, vals.get(f))
        for k, v in vals.items():
            setattr(o, k, v)
        db.commit()
        return to_dict(o)

    @router.delete(f"/{path}/{{oid}}", name=f"delete_{path}")
    def _delete(oid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
        n = db.query(Model).filter_by(id=oid, user_id=u.workspace_id).delete()
        db.commit()
        if not n:
            raise HTTPException(404, "Não encontrado")
        return {"ok": True}


crud("accounts", Account, AccountIn, order=Account.name)
crud("categories", Category, CategoryIn, order=Category.name)
crud("contracts", Contract, ContractIn, {"category_id": Category, "account_id": Account}, order=Contract.due_day)
crud("incomes", Income, IncomeIn, order=Income.pay_day)
crud("goals", Goal, GoalIn)
crud("assets", Asset, AssetIn, order=Asset.created_at)
crud("receivables", Receivable, ReceivableIn, {"account_id": Account}, order=Receivable.due_date)


# ---------------------------------------------------------------- FIPE (valor de mercado de veículos)
# Proxy pra tabela FIPE pública (parallelum.com.br): evita CORS no frontend e cacheia em
# memória por um dia — marcas/modelos praticamente não mudam e a tabela FIPE é mensal.
_FIPE_BASE = "https://parallelum.com.br/fipe/api/v1"
_fipe_cache: dict[str, tuple[float, object]] = {}
_FIPE_TTL = 60 * 60 * 24


def _fipe_get(path: str):
    now = time.time()
    hit = _fipe_cache.get(path)
    if hit and now - hit[0] < _FIPE_TTL:
        return hit[1]
    r = httpx.get(f"{_FIPE_BASE}{path}", timeout=15)
    if r.status_code >= 300:
        raise HTTPException(502, "Tabela FIPE indisponível no momento.")
    data = r.json()
    _fipe_cache[path] = (now, data)
    return data


@router.get("/fipe/marcas")
def fipe_marcas(u: User = Depends(current_user_active)):
    return _fipe_get("/carros/marcas")


@router.get("/fipe/modelos")
def fipe_modelos(marca: str, u: User = Depends(current_user_active)):
    return _fipe_get(f"/carros/marcas/{marca}/modelos")["modelos"]


@router.get("/fipe/anos")
def fipe_anos(marca: str, modelo: str, u: User = Depends(current_user_active)):
    return _fipe_get(f"/carros/marcas/{marca}/modelos/{modelo}/anos")


@router.get("/fipe/valor")
def fipe_valor(marca: str, modelo: str, ano: str, u: User = Depends(current_user_active)):
    return _fipe_get(f"/carros/marcas/{marca}/modelos/{modelo}/anos/{ano}")


class ConfirmPaymentIn(BaseModel):
    date: Optional[_Date] = None
    amount: Optional[float] = None


@router.get("/contracts/insights")
def contracts_insights(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    """Reajustes e renovações previstos + assinaturas detectadas nas cobranças repetidas."""
    return {"contracts": recurring.contract_insights(db, u.workspace_id),
            **recurring.detect_subscriptions(db, u.workspace_id)}


class AdjustIn(BaseModel):
    pct: float = Field(ge=-50, le=100)


@router.post("/contracts/{cid}/apply-adjustment")
def apply_contract_adjustment(cid: int, data: AdjustIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    """Aplica o reajuste (percentual confirmado pela pessoa, vem sugerido pelo índice)."""
    c = db.query(Contract).filter_by(id=cid, user_id=u.workspace_id).first()
    if not c:
        raise HTTPException(404, "Contrato não encontrado")
    c.amount = round(c.amount * (1 + data.pct / 100), 2)
    c.last_adjusted_at = date.today()
    db.commit()
    return to_dict(c)


@router.post("/contracts/{cid}/confirm-payment")
def confirm_contract_payment(cid: int, data: ConfirmPaymentIn, u: User = Depends(current_editor),
                             db: Session = Depends(get_db)):
    """Lança o pagamento de uma conta fixa com um clique — nunca automático e silencioso,
    porque isso mexe no saldo real; a pessoa confirma valor e data (ambos vêm preenchidos
    com o previsto no contrato, editáveis antes de enviar)."""
    c = db.query(Contract).filter_by(id=cid, user_id=u.workspace_id).first()
    if not c:
        raise HTTPException(404, "Contrato não encontrado")
    if not c.account_id:
        raise HTTPException(400, "Defina a conta de pagamento do contrato antes de confirmar.")
    pay_date = data.date or date.today()
    amount = data.amount if data.amount is not None else c.amount
    ext = "contract-" + hashlib.sha1(f"{cid}{pay_date}{amount}".encode()).hexdigest()[:20]
    if db.query(Transaction.id).filter_by(user_id=u.workspace_id, external_id=ext).first():
        raise HTTPException(400, "Este pagamento já foi lançado.")
    t = Transaction(user_id=u.workspace_id, account_id=c.account_id, category_id=c.category_id,
                    date=pay_date, description=c.name, amount=amount, type="expense",
                    external_id=ext, source="manual", category_locked=bool(c.category_id))
    db.add(t)
    _apply_tx_effect(db, t, +1)
    db.commit()
    return tx_out(t)


class ConfirmReceiptIn(BaseModel):
    date: Optional[_Date] = None
    amount: Optional[float] = None
    account_id: Optional[int] = None


@router.post("/receivables/{rid}/confirm-received")
def confirm_receivable(rid: int, data: ConfirmReceiptIn, u: User = Depends(current_editor),
                       db: Session = Depends(get_db)):
    """Dá baixa numa conta a receber com um clique, lançando a receita na conta escolhida —
    mesma lógica do 1-clique de contratos, só que na direção contrária (entrada, não saída)."""
    r = db.query(Receivable).filter_by(id=rid, user_id=u.workspace_id).first()
    if not r:
        raise HTTPException(404, "Conta a receber não encontrada")
    account_id = data.account_id or r.account_id
    if not account_id:
        raise HTTPException(400, "Escolha em qual conta o valor entrou.")
    _check_fk(db, u.workspace_id, Account, account_id)  # só contas do próprio workspace
    if r.received_at:
        raise HTTPException(400, "Este recebível já foi baixado.")
    recv_date = data.date or date.today()
    amount = data.amount if data.amount is not None else r.amount
    t = Transaction(user_id=u.workspace_id, account_id=account_id, category_id=None,
                    date=recv_date, description=f"{r.client_name} — {r.description}".strip(" —"),
                    amount=amount, type="income", source="manual")
    db.add(t)
    _apply_tx_effect(db, t, +1)
    r.received_at = datetime.utcnow()
    r.account_id = account_id
    db.commit()
    return tx_out(t)


@router.post("/transactions/{tid}/receipt")
async def upload_receipt(tid: int, file: UploadFile, u: User = Depends(current_editor),
                         db: Session = Depends(get_db)):
    """Anexa o comprovante de pagamento a um lançamento — "dar baixa" com prova em mãos."""
    t = db.query(Transaction).filter_by(id=tid, user_id=u.workspace_id).first()
    if not t:
        raise HTTPException(404, "Lançamento não encontrado")
    ext = storage.ext_for(file.content_type)
    if not ext:
        raise HTTPException(400, "Envie uma imagem (JPG/PNG/WEBP/HEIC) ou PDF.")
    s = get_settings()
    data = await file.read()
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise HTTPException(400, f"Arquivo maior que {s.max_upload_mb} MB.")
    old = t.receipt_path
    t.receipt_path = storage.save(u.workspace_id, tid, ext, data)
    db.commit()
    storage.delete(old)
    return tx_out(t)


@router.get("/transactions/{tid}/receipt")
def get_receipt(tid: int, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    t = db.query(Transaction).filter_by(id=tid, user_id=u.workspace_id).first()
    resolved = storage.resolve(t.receipt_path) if t and t.receipt_path else None
    if not resolved:
        raise HTTPException(404, "Sem comprovante para este lançamento.")
    kind, value = resolved
    return RedirectResponse(value) if kind == "url" else FileResponse(value)


@router.delete("/transactions/{tid}/receipt")
def delete_receipt(tid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    t = db.query(Transaction).filter_by(id=tid, user_id=u.workspace_id).first()
    if not t:
        raise HTTPException(404, "Lançamento não encontrado")
    if t.receipt_path:
        storage.delete(t.receipt_path)
        t.receipt_path = None
        db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- regras de categoria
@router.get("/rules")
def list_rules(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    return [to_dict(r) for r in db.query(CategoryRule).filter_by(user_id=u.workspace_id)
            .order_by(CategoryRule.priority.desc())]


@router.post("/rules")
def create_rule(data: RuleIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    _check_fk(db, u.workspace_id, Category, data.category_id)
    r = CategoryRule(user_id=u.workspace_id, pattern=data.pattern, category_id=data.category_id, priority=data.priority)
    db.add(r)
    db.commit()
    updated = 0
    if data.apply_existing:
        for t in db.query(Transaction).filter(Transaction.user_id == u.workspace_id,
                                              Transaction.category_locked.is_(False),
                                              Transaction.description.ilike(f"%{data.pattern}%")):
            t.category_id = data.category_id
            updated += 1
        db.commit()
    return {**to_dict(r), "updated": updated}


@router.delete("/rules/{rid}")
def delete_rule(rid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    db.query(CategoryRule).filter_by(id=rid, user_id=u.workspace_id).delete()
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- transações
def tx_out(t: Transaction):
    d = to_dict(t)
    d["account_name"] = t.account.name if t.account else ""
    d["to_account_name"] = t.to_account.name if t.to_account else ""
    d["category_name"] = t.category.name if t.category else ""
    d["category_color"] = t.category.color if t.category else "#94a3b8"
    d["has_receipt"] = bool(t.receipt_path)
    d["tags"] = _tags_out(t.tags)
    d["cost_center_name"] = t.cost_center.name if t.cost_center else ""
    del d["receipt_path"]  # caminho no servidor não vai pro cliente; use GET .../receipt
    return d


@router.get("/transactions")
def list_transactions(start: Optional[date] = None, end: Optional[date] = None,
                      account_id: Optional[int] = None, category_id: Optional[int] = None,
                      type: Optional[str] = None, q: Optional[str] = None,
                      min_amount: Optional[float] = None, max_amount: Optional[float] = None,
                      source: Optional[str] = None,
                      cost_center_id: Optional[int] = None, tag: Optional[str] = None,
                      limit: int = 500, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    qry = db.query(Transaction).filter(Transaction.user_id == u.workspace_id)
    if start: qry = qry.filter(Transaction.date >= start)
    if end: qry = qry.filter(Transaction.date <= end)
    if account_id: qry = qry.filter(Transaction.account_id == account_id)
    if category_id: qry = qry.filter(Transaction.category_id == category_id)
    if type: qry = qry.filter(Transaction.type == type)
    if source: qry = qry.filter(Transaction.source == source)
    if cost_center_id is not None:  # 0 = só os sem centro de custo
        qry = qry.filter(Transaction.cost_center_id == cost_center_id if cost_center_id else Transaction.cost_center_id.is_(None))
    if tag:
        t = _tags_out(_tags_in([tag]))
        if t:
            qry = qry.filter(Transaction.tags.like(f"%,{t[0]},%"))
    if min_amount is not None: qry = qry.filter(Transaction.amount >= min_amount)
    if max_amount is not None: qry = qry.filter(Transaction.amount <= max_amount)
    if q: qry = qry.filter(or_(Transaction.description.ilike(f"%{q}%"), Transaction.notes.ilike(f"%{q}%")))
    rows = qry.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(min(limit, 5000)).all()
    return [tx_out(t) for t in rows]


@router.post("/transactions")
def create_transaction(data: TransactionIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    _check_fk(db, u.workspace_id, Account, data.account_id)
    _check_fk(db, u.workspace_id, Category, data.category_id)
    if data.type == "transfer":
        if not data.to_account_id:
            raise HTTPException(400, "Informe a conta de destino da transferência.")
        if data.to_account_id == data.account_id:
            raise HTTPException(400, "A conta de destino deve ser diferente da conta de origem.")
        _check_fk(db, u.workspace_id, Account, data.to_account_id)
    cat = data.category_id or categorize(db, u.workspace_id, data.description, data.type)
    cc = data.cost_center_id or None
    _check_fk(db, u.workspace_id, CostCenter, cc)
    tags = _tags_in(data.tags)
    created = []
    per = round(data.amount / data.installments, 2)
    for i in range(data.installments):
        amt = per if i < data.installments - 1 else round(data.amount - per * (data.installments - 1), 2)
        t = Transaction(user_id=u.workspace_id, account_id=data.account_id,
                        to_account_id=data.to_account_id if data.type == "transfer" else None,
                        category_id=cat, date=analytics.add_months(data.date, i), description=data.description,
                        amount=amt, type=data.type, notes=data.notes,
                        installment=f"{i + 1}/{data.installments}" if data.installments > 1 else None,
                        category_locked=bool(data.category_id), cost_center_id=cc, tags=tags)
        db.add(t)
        created.append(t)
        _apply_tx_effect(db, t, +1)
    db.commit()
    return [tx_out(t) for t in created]


class TxPatch(BaseModel):
    category_id: Optional[int] = None
    to_account_id: Optional[int] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    date: Optional[_Date] = None
    amount: Optional[float] = None
    type: Optional[str] = None
    cost_center_id: Optional[int] = None  # 0 = tirar do centro de custo
    tags: Optional[list[str]] = None      # [] = tirar todas as tags
    create_rule: bool = False


@router.patch("/transactions/{tid}")
def patch_transaction(tid: int, data: TxPatch, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    t = db.query(Transaction).filter_by(id=tid, user_id=u.workspace_id).first()
    if not t:
        raise HTTPException(404, "Não encontrado")
    _apply_tx_effect(db, t, -1)  # desfaz o efeito de caixa atual antes de editar

    vals = data.model_dump(exclude_none=True, exclude={"create_rule"})
    if "cost_center_id" in vals:
        vals["cost_center_id"] = vals["cost_center_id"] or None
        _check_fk(db, u.workspace_id, CostCenter, vals["cost_center_id"])
    if "tags" in vals:
        vals["tags"] = _tags_in(vals["tags"])
    if "date" in vals and vals["date"] != t.date:
        t.invoice_month = None  # data mudou à mão: a fatura volta a seguir o dia de fechamento
    if "category_id" in vals:
        _check_fk(db, u.workspace_id, Category, vals["category_id"])
        t.category_locked = True
    if "to_account_id" in vals:
        _check_fk(db, u.workspace_id, Account, vals["to_account_id"])
    for k, v in vals.items():
        setattr(t, k, v)
    if t.type == "transfer" and not t.to_account_id:
        raise HTTPException(400, "Informe a conta de destino da transferência.")
    if t.type == "transfer" and t.to_account_id == t.account_id:
        raise HTTPException(400, "A conta de destino deve ser diferente da conta de origem.")

    if data.create_rule and data.category_id:
        pattern = " ".join(t.description.split()[:2])[:60]
        if pattern:
            db.add(CategoryRule(user_id=u.workspace_id, pattern=pattern, category_id=data.category_id, priority=1))
    _apply_tx_effect(db, t, +1)  # reaplica com os valores (possivelmente novos)
    db.commit()
    return tx_out(t)


@router.delete("/transactions/{tid}")
def delete_transaction(tid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    t = db.query(Transaction).filter_by(id=tid, user_id=u.workspace_id).first()
    if not t:
        raise HTTPException(404, "Não encontrado")
    _apply_tx_effect(db, t, -1)
    storage.delete(t.receipt_path)
    db.delete(t)
    db.commit()
    return {"ok": True}


class TxBulk(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    action: str = Field(pattern="^(categorize|delete|cost_center|add_tag|remove_tag)$")
    category_id: Optional[int] = None
    cost_center_id: Optional[int] = None  # 0 = tirar do centro de custo
    tag: Optional[str] = None


@router.post("/transactions/bulk")
def bulk_transactions(data: TxBulk, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    """Revisão do mês em lote: categorizar ou excluir vários lançamentos de uma vez. Excluir
    desfaz o efeito de caixa de cada um, igual ao DELETE individual."""
    txs = db.query(Transaction).filter(Transaction.user_id == u.workspace_id,
                                       Transaction.id.in_(data.ids)).all()
    if data.action == "categorize":
        if not data.category_id:
            raise HTTPException(400, "Escolha a categoria.")
        _check_fk(db, u.workspace_id, Category, data.category_id)
        for t in txs:
            t.category_id = data.category_id
            t.category_locked = True
    elif data.action == "cost_center":
        cc = data.cost_center_id or None
        _check_fk(db, u.workspace_id, CostCenter, cc)
        for t in txs:
            t.cost_center_id = cc
    elif data.action in ("add_tag", "remove_tag"):
        tag = _tags_out(_tags_in([data.tag]))
        if not tag:
            raise HTTPException(400, "Informe a tag.")
        for t in txs:
            cur = _tags_out(t.tags)
            t.tags = _tags_in(cur + tag if data.action == "add_tag" else [x for x in cur if x != tag[0]])
    else:
        for t in txs:
            _apply_tx_effect(db, t, -1)
            storage.delete(t.receipt_path)
            db.delete(t)
    db.commit()
    return {"ok": True, "count": len(txs)}


@router.post("/transactions/import")
async def import_statement(account_id: int, file: UploadFile, invert: bool = False, dry_run: bool = False,
                           invoice: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
                           u: User = Depends(current_editor), db: Session = Depends(get_db)):
    """Extrato ou fatura de cartão em CSV (layouts de vários bancos) ou OFX/XML.
    invert=True quando o arquivo traz as compras com valor positivo (comum na fatura em CSV).
    dry_run=True só devolve a prévia, sem gravar. Reimportar o mesmo arquivo não duplica:
    cada linha vira um external_id (FITID no OFX; hash de data+descrição+valor no CSV).

    No cartão, o arquivo é a fatura `invoice` (mês do fechamento; se omitido, a do ciclo da
    compra mais recente) e todas as linhas ficam presas a ela (invoice_month). Assim o total
    bate com o do banco mesmo quando uma compra perto do fechamento entrou na fatura seguinte."""
    acc = db.query(Account).filter_by(id=account_id, user_id=u.workspace_id).first()
    if not acc:
        raise HTTPException(400, "Conta inválida")
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "Arquivo grande demais (máx. 5 MB).")
    try:
        fmt, rows = statement_import.parse(file.filename or "", raw)
    except statement_import.StatementError as e:
        raise HTTPException(400, str(e))
    if not rows:
        raise HTTPException(400, "Nenhuma transação encontrada no arquivo.")

    is_card = acc.kind == "credit_card"
    uid = u.workspace_id
    ym = (invoice or analytics.invoice_of_date(acc, max(r.date for r in rows))) if is_card else None

    def fit_cycle(d: date, ym_k: str) -> date:
        """Parcela dentro do ciclo da sua fatura. Alguns bancos repetem a data da compra
        original em todas as parcelas (03/10 de uma compra de meses atrás)."""
        s, e, _ = analytics.invoice_cycle(acc, ym_k)
        for _ in range(48):
            if d >= s:
                break
            d = analytics.add_months(d, 1)
        return min(d, e)

    seen, used, touched, items, file_inst = {}, set(), set(), [], set()
    for r in rows:
        if r.installment:
            n, tot = map(int, r.installment.split("/"))
            file_inst.add((r.description.lower(), tot, n))
    for r in rows:
        v = -r.amount if invert else r.amount
        if r.fitid:
            ext = "ofx-" + hashlib.sha1(f"{account_id}{r.fitid}".encode()).hexdigest()[:20]
        else:
            # a 1ª ocorrência mantém o hash antigo (reimportar arquivos de antes não duplica);
            # compras iguais no mesmo dia (dois cafés) ganham #2, #3… em vez de sumirem
            base = f"{account_id}{r.date}{r.description}{v}"
            seen[base] = seen.get(base, 0) + 1
            ext = "csv-" + hashlib.sha1((base if seen[base] == 1 else f"{base}#{seen[base]}").encode()).hexdigest()[:20]
        if ext in used:
            continue
        used.add(ext)
        d = fit_cycle(r.date, ym) if is_card and r.installment else r.date
        tx = None
        if is_card and v > 0 and "pagamento" in statement_import._norm(r.description):
            status = "skip"  # pagamento da fatura anterior: não é receita nem entra no total
        elif tx := db.query(Transaction).filter_by(user_id=uid, external_id=ext).first():
            status = "dup"
        elif r.installment and v < 0 and (tx := _find_installment(db, uid, account_id, r.description, r.installment, -v, d, touched)):
            status = "match"  # parcela já prevista (importação anterior) ou lançada à mão
        elif is_card and v < 0 and not r.installment and (tx := _find_manual(db, uid, account_id, -v, r.date, touched)):
            status = "manual"  # mesma compra que você já tinha lançado à mão
        else:
            status = "new"
        if tx:
            touched.add(tx.id)
        items.append({"date": d.isoformat(), "description": r.description, "amount": round(v, 2),
                      "installment": r.installment, "status": status, "_ext": ext, "_tx": tx})

    # parcelas futuras: "Loja X 3/10" na fatura de hoje → prevê 4/10…10/10 nas faturas seguintes.
    # Quando a fatura do mês chegar, a parcela real substitui a prevista (status "match").
    future = {}
    for i in items:
        if i["status"] == "skip" or not i["installment"] or i["amount"] >= 0:
            continue
        n, tot = map(int, i["installment"].split("/"))
        d0, amt, desc = date.fromisoformat(i["date"]), -i["amount"], i["description"]
        first = analytics.add_months(d0, -(n - 1)).strftime("%Y%m")
        for k in range(n + 1, tot + 1):
            if (desc.lower(), tot, k) in file_inst:
                continue
            ym_k = analytics.ym_add(ym, k - n) if ym else None
            dk = analytics.add_months(d0, k - n)
            if ym_k:
                s, e, _ = analytics.invoice_cycle(acc, ym_k)
                dk = min(max(dk, s), e)
            ext = "prev-" + hashlib.sha1(f"{account_id}{desc.lower()}{tot}{k}{first}{round(amt)}".encode()).hexdigest()[:20]
            if ext in future or db.query(Transaction.id).filter_by(user_id=uid, external_id=ext).first():
                continue
            if _find_installment(db, uid, account_id, desc, f"{k}/{tot}", amt, dk):
                continue
            future[ext] = {"date": dk.isoformat(), "description": desc, "amount": -amt,
                           "installment": f"{k}/{tot}", "invoice_month": ym_k}

    new = [i for i in items if i["status"] == "new"]
    linked = [i for i in items if i["status"] in ("dup", "match", "manual")]
    summary = {
        "format": fmt, "total": len(items), "new": len(new), "future": len(future),
        "matched": sum(i["status"] in ("match", "manual") for i in items),
        "duplicates": sum(i["status"] == "dup" for i in items),
        "skipped": sum(i["status"] == "skip" for i in items),
        "expenses": round(-sum(i["amount"] for i in new if i["amount"] < 0), 2),
        "incomes": round(sum(i["amount"] for i in new if i["amount"] > 0), 2),
        "future_amount": round(-sum(f["amount"] for f in future.values()), 2),
        # ainda não estava presa a esta fatura → vai ser re-vinculada ao importar
        "relink": sum(1 for i in linked if is_card and i["_tx"].invoice_month != ym),
    }
    if is_card:
        start, end, due = analytics.invoice_cycle(acc, ym)
        file_total = -sum(i["amount"] for i in items if i["status"] != "skip")
        # lançamentos que o Finora põe nesta fatura mas que não estão no arquivo do banco:
        # é aqui que costuma estar a diferença (lançado à mão, parcela prevista que não veio)
        extra = [t for t in analytics.invoice_transactions(db, acc, ym) if t.id not in touched]
        extra_total = sum(t.amount if t.type == "expense" else -t.amount for t in extra)
        bank = statement_import.statement_balance(raw) if fmt == "ofx" else None
        summary["invoice"] = {
            "ym": ym, "period_start": start.isoformat(), "period_end": end.isoformat(), "due_date": due.isoformat(),
            "file_total": round(file_total, 2), "bank_total": round(abs(bank), 2) if bank is not None else None,
            "after_total": round(file_total + extra_total, 2),
            "extra": [{"date": t.date.isoformat(), "description": t.description, "installment": t.installment,
                       "amount": round(t.amount if t.type == "expense" else -t.amount, 2),
                       "predicted": (t.external_id or "").startswith("prev-")} for t in extra[:50]],
            "missing_days": not (acc.closing_day and acc.due_day),
        }
    if dry_run:
        summary["rows"] = [{k: v for k, v in i.items() if not k.startswith("_")} for i in items[:300]]
        return summary

    for i in new:
        v, d = i["amount"], date.fromisoformat(i["date"])
        typ = "expense" if v < 0 else "income"
        db.add(Transaction(user_id=uid, account_id=account_id, date=d, invoice_month=ym,
                           description=i["description"], amount=abs(v), type=typ,
                           installment=i["installment"], external_id=i["_ext"], source="manual",
                           category_id=categorize(db, uid, i["description"], typ)))
        _adjust_balance(db, account_id, d, v, +1)
    for i in linked:
        t = i["_tx"]
        if i["status"] == "match" and (t.external_id or "").startswith("prev-"):  # prevista vira real
            _apply_tx_effect(db, t, -1)
            t.date, t.amount, t.notes = date.fromisoformat(i["date"]), -i["amount"], ""
            _apply_tx_effect(db, t, +1)
        if i["status"] != "dup":
            t.external_id = i["_ext"]
        if is_card:
            t.invoice_month = ym
    for ext, f in future.items():
        db.add(Transaction(user_id=uid, account_id=account_id, date=date.fromisoformat(f["date"]),
                           invoice_month=f["invoice_month"],
                           description=f["description"], amount=-f["amount"], type="expense",
                           installment=f["installment"], external_id=ext, source="manual",
                           notes="Parcela prevista: confirmada quando a fatura desse mês for importada.",
                           category_id=categorize(db, uid, f["description"], "expense")))
    acc.last_import_at = datetime.utcnow()
    db.commit()
    out = {**summary, "imported": len(new)}
    if is_card:
        out["invoice"]["after_total"] = analytics.invoice(db, acc, ym)["total"]
    return out


def _find_installment(db, uid, account_id, desc, inst, amount, near, exclude=()):
    """Parcela n/T já existente da mesma compra — prevista por uma importação anterior ou
    lançada à mão (sem external_id). Tolera centavos de arredondamento e alguns dias de
    diferença na data; nunca casa com outra linha já importada de verdade."""
    q = db.query(Transaction).filter(
        Transaction.user_id == uid, Transaction.account_id == account_id, Transaction.type == "expense",
        Transaction.installment == inst, func.lower(Transaction.description) == desc.lower(),
        or_(Transaction.external_id.is_(None), Transaction.external_id.like("prev-%")))
    for t in q:
        if t.id not in exclude and abs(t.amount - amount) <= max(1.0, 0.02 * amount) and abs((t.date - near).days) <= 45:
            return t
    return None


def _find_manual(db, uid, account_id, amount, near, exclude=()):
    """Compra à vista lançada à mão no cartão (sem external_id) com o mesmo valor, até 3
    dias de diferença — a descrição costuma ser outra ("Mercado" × "SUPERMERCADO XYZ")."""
    q = db.query(Transaction).filter(
        Transaction.user_id == uid, Transaction.account_id == account_id, Transaction.type == "expense",
        Transaction.external_id.is_(None), Transaction.installment.is_(None),
        Transaction.date >= near - timedelta(days=3), Transaction.date <= near + timedelta(days=3))
    for t in q:
        if t.id not in exclude and round(t.amount, 2) == round(amount, 2):
            return t
    return None


@router.get("/cards/{account_id}/invoices/{ym}")
def card_invoice(account_id: int, ym: str = Path(..., pattern=r"^\d{4}-\d{2}$"),
                 u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    """Uma fatura do cartão com a composição (compras, parcelas, encargos, créditos) e os lançamentos."""
    acc = db.query(Account).filter_by(id=account_id, user_id=u.workspace_id, kind="credit_card").first()
    if not acc:
        raise HTTPException(404, "Cartão não encontrado")
    inv = analytics.invoice(db, acc, ym, with_items=True)
    inv["items"] = [tx_out(t) for t in inv["items"]]
    return inv


def _csv_safe(v: str) -> str:
    """Neutraliza injeção de fórmula: Excel/Sheets executam células que começam com
    =, +, -, @, tab ou CR quando o CSV é aberto direto na planilha."""
    v = v or ""
    return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


@router.get("/transactions/export")
def export_csv(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["data", "descricao", "valor", "tipo", "conta", "categoria", "parcela", "obs", "centro_de_custo", "tags"])
    for t in db.query(Transaction).filter_by(user_id=u.workspace_id).order_by(Transaction.date):
        w.writerow([t.date.strftime("%d/%m/%Y"), _csv_safe(t.description), f"{t.amount:.2f}".replace(".", ","),
                    t.type, t.account.name if t.account else "", t.category.name if t.category else "",
                    t.installment or "", _csv_safe(t.notes),
                    _csv_safe(t.cost_center.name if t.cost_center else ""), _csv_safe(" ".join(_tags_out(t.tags)))])
    return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=finora-lancamentos.csv"})


# ---------------------------------------------------------------- painel, alertas, mercado, IA
@router.get("/dashboard")
def get_dashboard(ref: Optional[date] = None, months: int = Query(6, ge=1, le=24),
                  u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    analytics.run_alerts(db, u.workspace_id, ref)
    return analytics.dashboard(db, u.workspace_id, ref, months)


@router.get("/installments")
def get_installments(ref: Optional[date] = None, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    return analytics.installment_plans(db, u.workspace_id, ref or date.today())


@router.get("/alerts")
def list_alerts(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    return [to_dict(a) for a in db.query(Alert).filter_by(user_id=u.workspace_id)
            .order_by(Alert.created_at.desc()).limit(100)]


@router.post("/alerts/read")
def read_alerts(u: User = Depends(current_editor), db: Session = Depends(get_db)):
    db.query(Alert).filter_by(user_id=u.workspace_id, read=False).update({"read": True})
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ fluxo de caixa
@router.get("/cashflow")
def get_cashflow(granularity: str = Query("month", pattern="^(day|week|month|year)$"),
                 start: Optional[date] = None, end: Optional[date] = None,
                 u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    if start and end and (end - start).days > 366 * 5:
        raise HTTPException(400, "Período grande demais (máx. 5 anos).")
    return cashflow.build(db, u.workspace_id, granularity, start, end)


# ------------------------------------------------------------------ centros de custo e tags
class CostCenterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field("#6366f1", max_length=9)
    archived: bool = False


@router.get("/cost-centers")
def list_cost_centers(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    return [to_dict(c) for c in db.query(CostCenter).filter_by(user_id=u.workspace_id).order_by(CostCenter.archived, CostCenter.name)]


@router.post("/cost-centers")
def create_cost_center(data: CostCenterIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    c = CostCenter(user_id=u.workspace_id, **data.model_dump())
    db.add(c)
    db.commit()
    return to_dict(c)


@router.put("/cost-centers/{cid}")
def update_cost_center(cid: int, data: CostCenterIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    c = db.query(CostCenter).filter_by(id=cid, user_id=u.workspace_id).first()
    if not c:
        raise HTTPException(404, "Não encontrado")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return to_dict(c)


@router.delete("/cost-centers/{cid}")
def delete_cost_center(cid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    c = db.query(CostCenter).filter_by(id=cid, user_id=u.workspace_id).first()
    if not c:
        raise HTTPException(404, "Não encontrado")
    # a coluna foi criada por ALTER TABLE (sem FK em bancos antigos): solta os lançamentos à mão
    db.query(Transaction).filter_by(user_id=u.workspace_id, cost_center_id=cid).update({"cost_center_id": None})
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.get("/tags")
def list_tags(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    counts: dict = {}
    for (s,) in db.query(Transaction.tags).filter(Transaction.user_id == u.workspace_id, Transaction.tags != ""):
        for t in _tags_out(s):
            counts[t] = counts.get(t, 0) + 1
    return [{"tag": t, "count": n} for t, n in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]


@router.get("/reports/cost-centers")
def report_cost_centers(start: date, end: date, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    """Despesas e receitas do período por centro de custo e por tag (transferências ficam fora)."""
    txs = db.query(Transaction).filter(Transaction.user_id == u.workspace_id, Transaction.date >= start,
                                       Transaction.date <= end, Transaction.type.in_(("expense", "income"))).all()
    centers = {c.id: c for c in db.query(CostCenter).filter_by(user_id=u.workspace_id)}
    by_cc: dict = {}
    by_tag: dict = {}
    for t in txs:
        k = t.cost_center_id if t.cost_center_id in centers else None
        row = by_cc.setdefault(k, {"expense": 0.0, "income": 0.0, "count": 0})
        row[t.type] += t.amount
        row["count"] += 1
        for tag in _tags_out(t.tags):
            r = by_tag.setdefault(tag, {"expense": 0.0, "income": 0.0, "count": 0})
            r[t.type] += t.amount
            r["count"] += 1
    total_exp = sum(r["expense"] for r in by_cc.values()) or 0
    cc_rows = [{"id": k, "name": centers[k].name if k else "Sem centro de custo",
                "color": centers[k].color if k else "#94a3b8",
                "expense": round(r["expense"], 2), "income": round(r["income"], 2), "count": r["count"],
                "share": round(r["expense"] / total_exp * 100, 1) if total_exp else 0}
               for k, r in by_cc.items()]
    tag_rows = [{"tag": k, "expense": round(r["expense"], 2), "income": round(r["income"], 2), "count": r["count"]}
                for k, r in by_tag.items()]
    return {"total_expense": round(total_exp, 2),
            "cost_centers": sorted(cc_rows, key=lambda x: (x["id"] is None, -x["expense"])),
            "tags": sorted(tag_rows, key=lambda x: -x["expense"])}


# ------------------------------------------------------------------ investimentos
_CLASSES = "^(acao|fii|etf|bdr|cripto|internacional|cdb|lci_lca|tesouro|debenture|fundo|outro)$"


class InvestmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    ticker: str = Field("", max_length=30)
    asset_class: str = Field(pattern=_CLASSES)
    broker: str = Field("", max_length=80)
    currency: str = Field("BRL", pattern="^(BRL|USD)$")
    index_type: Optional[str] = Field(None, pattern="^(cdi|selic|pre|ipca)$")
    index_rate: Optional[float] = Field(None, ge=0, le=1000)
    maturity: Optional[date] = None
    tax_free: bool = False
    manual_price: Optional[float] = Field(None, ge=0)
    target_pct: Optional[float] = Field(None, ge=0, le=100)
    archived: bool = False


class TradeIn(BaseModel):
    date: date
    kind: str = Field(pattern="^(buy|sell)$")
    quantity: float = Field(gt=0)
    price: float = Field(ge=0)
    fees: float = Field(0, ge=0)
    day_trade: bool = False
    note: str = Field("", max_length=200)


class EventIn(BaseModel):
    date: date
    kind: str = Field(pattern="^(dividend|jcp|income|interest|amortization)$")
    amount: float = Field(gt=0)
    per_unit: Optional[float] = Field(None, ge=0)
    note: str = Field("", max_length=200)


def _get_inv(db, uid, iid) -> Investment:
    i = db.query(Investment).filter_by(id=iid, user_id=uid).first()
    if not i:
        raise HTTPException(404, "Investimento não encontrado")
    return i


def _clean_investment(data: InvestmentIn) -> dict:
    vals = data.model_dump()
    vals["ticker"] = vals["ticker"].strip().upper()
    if vals["asset_class"] in portfolio.VARIABLE + ("cripto", "internacional"):
        vals["index_type"] = vals["index_rate"] = None  # renda variável não tem indexador
    return vals


@router.get("/investments")
def get_portfolio(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    p = portfolio.build(db, u.workspace_id)
    p.pop("_positions", None)
    return p


@router.post("/investments")
def create_investment(data: InvestmentIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    vals = _clean_investment(data)
    i = Investment(user_id=u.workspace_id, manual_price_at=date.today() if vals["manual_price"] is not None else None, **vals)
    db.add(i)
    db.commit()
    return to_dict(i)


@router.put("/investments/{iid}")
def update_investment(iid: int, data: InvestmentIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    i = _get_inv(db, u.workspace_id, iid)
    vals = _clean_investment(data)
    if vals["manual_price"] != i.manual_price:
        i.manual_price_at = date.today() if vals["manual_price"] is not None else None
    for k, v in vals.items():
        setattr(i, k, v)
    db.commit()
    return to_dict(i)


@router.delete("/investments/{iid}")
def delete_investment(iid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    db.delete(_get_inv(db, u.workspace_id, iid))
    db.commit()
    return {"ok": True}


@router.get("/investments/{iid}/history")
def investment_history(iid: int, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    i = _get_inv(db, u.workspace_id, iid)
    return {"trades": [to_dict(t) for t in sorted(i.trades, key=lambda t: (t.date, t.id), reverse=True)],
            "events": [to_dict(e) for e in sorted(i.events, key=lambda e: (e.date, e.id), reverse=True)]}


@router.post("/investments/{iid}/trades")
def add_trade(iid: int, data: TradeIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    i = _get_inv(db, u.workspace_id, iid)
    if data.kind == "sell" and i.asset_class in portfolio.VARIABLE + ("cripto", "internacional"):
        have = portfolio.position(i, {}, data.date, None)["quantity"]
        if data.quantity > have + 1e-9:
            raise HTTPException(400, f"Você tem {have:g} nessa data; não dá pra vender {data.quantity:g}.")
    db.add(InvestmentTrade(user_id=u.workspace_id, investment_id=i.id, **data.model_dump()))
    db.commit()
    return {"ok": True}


@router.delete("/investments/{iid}/trades/{tid}")
def delete_trade(iid: int, tid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    i = _get_inv(db, u.workspace_id, iid)
    if not db.query(InvestmentTrade).filter_by(id=tid, investment_id=i.id, user_id=u.workspace_id).delete():
        raise HTTPException(404, "Operação não encontrada")
    db.commit()
    return {"ok": True}


@router.post("/investments/{iid}/events")
def add_event(iid: int, data: EventIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    i = _get_inv(db, u.workspace_id, iid)
    db.add(InvestmentEvent(user_id=u.workspace_id, investment_id=i.id, **data.model_dump()))
    db.commit()
    return {"ok": True}


@router.delete("/investments/{iid}/events/{eid}")
def delete_event(iid: int, eid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    i = _get_inv(db, u.workspace_id, iid)
    if not db.query(InvestmentEvent).filter_by(id=eid, investment_id=i.id, user_id=u.workspace_id).delete():
        raise HTTPException(404, "Provento não encontrado")
    db.commit()
    return {"ok": True}


@router.get("/portfolio/dividends")
def portfolio_dividends(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    return portfolio.dividends(db, u.workspace_id)


@router.get("/portfolio/tax")
def portfolio_tax(year: Optional[int] = Query(None, ge=2000, le=2100), u: User = Depends(current_user_active),
                  db: Session = Depends(get_db)):
    return portfolio.income_tax(db, u.workspace_id, year)


@router.get("/portfolio/history")
def portfolio_history(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    rows = db.query(PortfolioSnapshot).filter_by(user_id=u.workspace_id).order_by(PortfolioSnapshot.date).all()
    return [{"date": s.date.isoformat(), "value": s.value, "invested": s.invested, "net_worth": s.net_worth} for s in rows]


# ------------------------------------------------------------------ caixinhas
class PotIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    institution: str = Field("", max_length=120)
    color: str = Field("#10b981", max_length=9)
    yield_type: str = Field("cdi", pattern="^(cdi|selic|pre)$")
    yield_rate: float = Field(100, gt=0, le=1000)
    tax_free: bool = False
    goal_amount: Optional[float] = Field(None, ge=0)
    archived: bool = False
    # só na criação: quanto já tem guardado e desde quando
    initial_amount: Optional[float] = Field(None, ge=0)
    start_date: Optional[date] = None


class PotMoveIn(BaseModel):
    date: date
    kind: str = Field(pattern="^(deposit|withdraw)$")
    amount: float = Field(gt=0)
    note: str = Field("", max_length=200)


class PotBalanceIn(BaseModel):
    balance: float = Field(ge=0)


def _pot_out(p: Pot, today: date | None = None) -> dict:
    d = to_dict(p)
    d["summary"] = pots.compute(p, p.moves, today)
    return d


def _get_pot(db, uid, pid) -> Pot:
    p = db.query(Pot).filter_by(id=pid, user_id=uid).first()
    if not p:
        raise HTTPException(404, "Caixinha não encontrada")
    return p


@router.get("/pots")
def list_pots(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    return [_pot_out(p) for p in db.query(Pot).filter_by(user_id=u.workspace_id).order_by(Pot.archived, Pot.name)]


@router.post("/pots")
def create_pot(data: PotIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    vals = data.model_dump(exclude={"initial_amount", "start_date"})
    p = Pot(user_id=u.workspace_id, **vals)
    db.add(p)
    db.flush()
    if data.initial_amount:
        db.add(PotMove(user_id=u.workspace_id, pot_id=p.id, date=data.start_date or date.today(),
                       kind="deposit", amount=data.initial_amount, note="Saldo inicial"))
    db.commit()
    db.refresh(p)
    return _pot_out(p)


@router.put("/pots/{pid}")
def update_pot(pid: int, data: PotIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    p = _get_pot(db, u.workspace_id, pid)
    for k, v in data.model_dump(exclude={"initial_amount", "start_date"}).items():
        setattr(p, k, v)
    db.commit()
    return _pot_out(p)


@router.delete("/pots/{pid}")
def delete_pot(pid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    db.delete(_get_pot(db, u.workspace_id, pid))
    db.commit()
    return {"ok": True}


@router.get("/pots/{pid}/moves")
def list_pot_moves(pid: int, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    p = _get_pot(db, u.workspace_id, pid)
    return [to_dict(m) for m in sorted(p.moves, key=lambda m: (m.date, m.id), reverse=True)]


@router.post("/pots/{pid}/moves")
def add_pot_move(pid: int, data: PotMoveIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    p = _get_pot(db, u.workspace_id, pid)
    if data.kind == "withdraw":
        bal = pots.compute(p, [m for m in p.moves if m.date <= data.date], data.date)["balance"]
        if data.amount > bal + 0.01:
            saldo = f"{bal:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            raise HTTPException(400, f"O resgate é maior que o saldo da caixinha nessa data (R$ {saldo}).")
    db.add(PotMove(user_id=u.workspace_id, pot_id=p.id, **data.model_dump()))
    db.commit()
    db.refresh(p)
    return _pot_out(p)


@router.delete("/pots/{pid}/moves/{mid}")
def delete_pot_move(pid: int, mid: int, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    p = _get_pot(db, u.workspace_id, pid)
    n = db.query(PotMove).filter_by(id=mid, pot_id=p.id, user_id=u.workspace_id).delete()
    db.commit()
    if not n:
        raise HTTPException(404, "Movimento não encontrado")
    db.refresh(p)
    return _pot_out(p)


@router.post("/pots/{pid}/balance")
def set_pot_balance(pid: int, data: PotBalanceIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    """Acerta com o saldo que o app do banco mostra hoje: a diferença vira rendimento (acerto),
    não depósito. Corrige feriados, centavos de arredondamento e taxa diferente da cadastrada."""
    p = _get_pot(db, u.workspace_id, pid)
    diff = round(data.balance - pots.compute(p, p.moves)["balance"], 2)
    if diff:
        db.add(PotMove(user_id=u.workspace_id, pot_id=p.id, date=date.today(), kind="adjust", amount=diff,
                       note="Acerto com o saldo do banco"))
        db.commit()
        db.refresh(p)
    return _pot_out(p)


@router.get("/market")
def get_market(u: User = Depends(current_user_active)):
    return market.indicators()


class SimIn(BaseModel):
    monthly: float = Field(ge=0)
    months: int = Field(ge=1, le=600)
    annual_rate: float = Field(ge=0, le=100)
    initial: float = 0


@router.post("/simulate")
def simulate(data: SimIn, u: User = Depends(current_user_active)):
    return market.simulate(data.monthly, data.months, data.annual_rate, data.initial)


class AdvisorIn(BaseModel):
    question: Optional[str] = Field(None, max_length=1000)


@router.post("/advisor")
def ask_advisor(data: AdvisorIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    dash = analytics.dashboard(db, u.workspace_id)
    content = advisor.generate(dash, data.question)
    rep = AdvisorReport(user_id=u.workspace_id, content=content,
                        snapshot={"question": data.question, "ref": dash["ref"]})
    db.add(rep)
    db.commit()
    return to_dict(rep)


@router.get("/advisor")
def list_reports(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    return [to_dict(r) for r in db.query(AdvisorReport).filter_by(user_id=u.workspace_id)
            .order_by(AdvisorReport.created_at.desc()).limit(20)]


# ---------------------------------------------------------------- assistente de uso
class AssistantIn(BaseModel):
    message: str = Field(max_length=500)


@router.post("/assistant", dependencies=[Depends(rate_limit("assistant", 30, 60))])
def ask_assistant(data: AssistantIn, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    return assistant.answer(db, u, data.message)


@router.get("/assistant/nudges")
def assistant_nudges(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    """O que o assistente lembraria por conta própria (ex.: conta vencendo hoje) —
    checado quando o app abre, não precisa perguntar."""
    return assistant.nudges(db, u)


# ---------------------------------------------------------------- Pluggy
@router.get("/pluggy/status")
def pluggy_status(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    return {"enabled": pluggy.enabled(),
            "items": [to_dict(i) for i in db.query(PluggyItem).filter_by(user_id=u.workspace_id)]}


@router.post("/pluggy/connect-token")
def pluggy_token(item_id: Optional[str] = None, u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    if item_id and not db.query(PluggyItem).filter_by(user_id=u.workspace_id, item_id=item_id).first():
        raise HTTPException(404, "Conexão não encontrada")
    try:
        return {"accessToken": pluggy.connect_token(u.workspace_id, item_id)}
    except pluggy.PluggyError as e:
        raise HTTPException(400, str(e))


class ItemIn(BaseModel):
    item_id: str = Field(min_length=10, max_length=64)


@router.post("/pluggy/items")
def pluggy_add_item(data: ItemIn, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    try:
        res = pluggy.sync_item(db, u.workspace_id, data.item_id)
    except pluggy.PluggyError as e:
        raise HTTPException(400, str(e))
    analytics.run_alerts(db, u.workspace_id)
    return res


@router.post("/pluggy/sync")
def pluggy_sync_all(u: User = Depends(current_editor), db: Session = Depends(get_db)):
    out = []
    for it in db.query(PluggyItem).filter_by(user_id=u.workspace_id).all():
        try:
            out.append(pluggy.sync_item(db, u.workspace_id, it.item_id))
        except pluggy.PluggyError as e:
            out.append({"item_id": it.item_id, "error": str(e)})
    analytics.run_alerts(db, u.workspace_id)
    return out


@router.delete("/pluggy/items/{item_id}")
def pluggy_remove(item_id: str, u: User = Depends(current_editor), db: Session = Depends(get_db)):
    row = db.query(PluggyItem).filter_by(user_id=u.workspace_id, item_id=item_id).first()
    if not row:
        raise HTTPException(404, "Não encontrado")
    pluggy.delete_item(item_id)
    db.delete(row)
    db.query(Account).filter_by(user_id=u.workspace_id, pluggy_item_id=item_id).update({"archived": True})
    db.commit()
    return {"ok": True}


def _webhook_sync(item_id: str):
    db = SessionLocal()
    try:
        row = db.query(PluggyItem).filter_by(item_id=item_id).first()
        if row:
            pluggy.sync_item(db, row.user_id, item_id, days=30)
            analytics.run_alerts(db, row.user_id)
    except Exception:
        pass
    finally:
        db.close()


@router.post("/pluggy/webhook")
async def pluggy_webhook(request: Request, bg: BackgroundTasks):
    s = get_settings()
    secret = s.pluggy_webhook_secret
    if not secret and s.public_url.startswith("https://"):
        raise HTTPException(503, "PLUGGY_WEBHOOK_SECRET não configurado.")  # em produção, nunca aberto
    if secret and not hmac.compare_digest(request.query_params.get("secret", ""), secret):
        raise HTTPException(401, "invalid")
    body = await request.json()
    item_id = body.get("itemId") or (body.get("item") or {}).get("id")
    if item_id and body.get("event") in {"item/updated", "item/created", "transactions/created",
                                         "transactions/updated"}:
        bg.add_task(_webhook_sync, item_id)
    return {"ok": True}
